import { error, json } from '@sveltejs/kit';
import { readSectionDrafts } from '$lib/server/evolution-section-drafts.server';
import { readRuleDrafts } from '$lib/server/evolution-rule-drafts.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess, requireEvolutionBatchAccess } from '$lib/server/community-locks.server';
import { accessNeededFor } from '$lib/server/evolution-door.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { currentPersonId, resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { draftsVersionOf, loadDockingGraph, loadLocalGraph } from '$lib/server/evolution-graph.server';
import { actionReadings, specificationActionEntries, specificationActionTrails } from '$lib/server/evolution-spec-actions.server';
import {
	DOSSIER_PARTS,
	evolutionAggregate,
	isDossierPart,
	loadEvolutionView,
	specificationPart
} from '$lib/server/evolution-view.server';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { readTouchedValidation } from '$lib/server/evolution-touched-validation.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import { signalAiActivity } from '$lib/server/ai-activity.server';
import {
	ACTIONS_UNREAD,
	findRequestByRef,
	readsSpecificationActions,
	isImpactHypothesis,
	unresolvedRequestReason,
	type FindingScope
} from '$domain/evolution';
import type { RequestHandler } from './$types';

/**
 * The Evolution section as ONE aggregate, readable and drivable in single
 * calls, so an MCP client runs a request from the raw need to acceptance
 * without recomputing the dossier's rules from the raw section document.
 *
 *   GET  /api/evolution?projectId=<id>[&requestId=<id or unique prefix>][&part=drafts|fields|proposals|impact|report|readings|history|versions|data|graph|docking|texts|coherence|points|knowledge]
 *        -> the board (every live request as a card, first), one dossier in
 *           counts, or one list of it, narrowed by `leaf` / `section` /
 *           `verdict` and paged by `offset` / `limit`. Without a request,
 *           part=leaves|sources pages the board's own lists.
 *   POST /api/evolution { projectId, operations[], as_person? }
 *        -> typed operations, applied atomically under the server's guards.
 *
 * Who is acting is resolved server-side (see evolution-actor.server.ts): the
 * MCP names itself as an AI client, and `as_person: true` relays the signed-in
 * person's own decision with the channel stamped on the timeline.
 */
/** The block Not validated in Knowledge of a request's Simulation, read on its own. */
const KNOWLEDGE_PART = 'knowledge';

const scopeParam = (raw: string | null): FindingScope | undefined => {
	if (raw === null) return undefined;
	if (raw === 'request' || raw === 'inherited') return raw;
	error(400, `unknown scope "${raw}". Valid: request, inherited`);
};

export const GET: RequestHandler = async (event) => {
	requireEvolutionAccess(event.locals.services);
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);
	const [view, actor] = await Promise.all([
		// Read for this reader: the private exchanges of others stay out of what is sent.
		loadEvolutionView(services, projectId, {
			readerId: currentPersonId(services)
		}),
		resolveEvolutionActor(services, event, projectId)
	]);
	const requestId = event.url.searchParams.get('requestId') ?? undefined;
	const part = event.url.searchParams.get('part') ?? undefined;
	// What the change touches that Knowledge has not validated, read for this reader (EVO-003).
	if (part === KNOWLEDGE_PART) {
		const lookup = requestId ? findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestId) : null;
		if (!requestId || !lookup || lookup.kind !== 'found')
			error(lookup?.kind === 'ambiguous' ? 400 : 404, requestId && lookup ? unresolvedRequestReason(requestId, lookup) : `part=${KNOWLEDGE_PART} needs a requestId`);
		const canWrite = await requireProjectAccess(event, projectId, 'write').then(() => true, () => false);
		const reader = await retrospecActor(services, projectId, event.cookies);
		const knowledge = await readTouchedValidation(services, projectId, lookup.request, reader, canWrite);
		return json({ projectId, revision: view.revision, requestId: lookup.request.id, knowledge });
	}
	if (part !== undefined && !isDossierPart(part)) {
		error(400, `unknown part "${part}". Valid: ${[...DOSSIER_PARTS, KNOWLEDGE_PART].join(', ')}`);
	}
	const int = (key: string): number | undefined => {
		const raw = event.url.searchParams.get(key);
		if (raw === null) return undefined;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 0) error(400, `${key} must be a non-negative integer`);
		return n;
	};
	// Each run_impact keeps its own findings, so the three hypotheses stay
	// readable side by side instead of only the one that ran last.
	const hypothesis = event.url.searchParams.get('hypothesis') ?? undefined;
	if (hypothesis !== undefined && !isImpactHypothesis(hypothesis)) {
		error(400, `unknown hypothesis "${hypothesis}". Valid: add, change, remove`);
	}
	// The changes to the other pages of the spec, read against the sections as they stand (ac-evo-draft-section-read).
	if (part === 'sections') {
		const lookup = requestId ? findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestId) : null;
		if (!requestId || !lookup || lookup.kind !== 'found')
			error(lookup?.kind === 'ambiguous' ? 400 : 404, requestId && lookup ? unresolvedRequestReason(requestId, lookup) : 'part=sections needs a requestId');
		const sections = await readSectionDrafts(services, projectId, lookup.request);
		const rules = await readRuleDrafts(services, projectId, lookup.request, view.language);
		return json({ projectId, revision: view.revision, requestId: lookup.request.id, total: sections.length + rules.length, sections, rules });
	}
	// Every item the Specification gate counts, the actions read with the engine's graph (criterion 2df61e72).
	if (part === 'specification') {
		const lookup = requestId ? findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestId) : null;
		if (!requestId || !lookup || lookup.kind !== 'found')
			error(lookup?.kind === 'ambiguous' ? 400 : 404, requestId && lookup ? unresolvedRequestReason(requestId, lookup) : 'part=specification needs a requestId');
		signalAiActivity(event, projectId, [lookup.request.id], 'read');
		const actions = await specificationActionEntries(services, view, lookup.request);
		const opts = { leaf: event.url.searchParams.get('leaf') ?? undefined, offset: int('offset'), limit: int('limit') };
		return json({ projectId, revision: view.revision, requests: [], request: specificationPart(view, lookup.request, actions, opts) });
	}
	// The graph is computed by the engine on demand, from the drafts' behaviour.
	if (part === 'graph' || part === 'docking') {
		const lookup = requestId
			? findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestId)
			: null;
		if (!requestId || !lookup || lookup.kind !== 'found')
			error(lookup?.kind === 'ambiguous' ? 400 : 404, requestId && lookup ? unresolvedRequestReason(requestId, lookup) : `part=${part} needs a requestId`);
		signalAiActivity(event, projectId, [lookup.request.id], 'read');
		// The network docks the request on the knowledge graph, built only when a reader opens it.
		if (part === 'docking') {
			const docking = await loadDockingGraph(services, view, lookup.request);
			if (!docking) error(503, ACTIONS_UNREAD);
			return json({ projectId, revision: view.revision, requestId: lookup.request.id, docking });
		}
		const reading = await loadLocalGraph(services, view, lookup.request);
		const head = { projectId, revision: view.revision, requestId: lookup.request.id, version: draftsVersionOf(lookup.request) };
		// Each action of the specification travels with where it stands, validated like an answer.
		if (reading.status === 'read') return json({ ...head, graph: reading.graph, readAt: reading.readAt, actions: actionReadings(view, lookup.request, reading.graph) });
		// The engine did not answer: the last good reading of these drafts, said as such, never a graph read without them (criterion c623df9c).
		const last = reading.last;
		return json({ ...head, unread: reading.reason, graph: last?.graph ?? null, readAt: last?.readAt ?? null, actions: last ? actionReadings(view, lookup.request, last.graph) : {} });
	}
	// The summary of a request before its freeze counts the Specification's actions too, read with the
	// engine's graph, since the Simulation and the freeze wait on them (ac-evo-form-step-lock, criterion c0a6eef3).
	const summarised = requestId && (part === undefined || part === 'summary') ? findRequestByRef(view.draft.requests.filter((r) => r.status !== 'deleted'), requestId) : null;
	const specificationActions =
		summarised?.kind === 'found' && readsSpecificationActions(summarised.request) ? await specificationActionTrails(services, view, summarised.request) : undefined;
	const aggregate = evolutionAggregate(view, actor, requestId, {
		specificationActions,
		part,
		section: event.url.searchParams.get('section') ?? undefined,
		verdict: event.url.searchParams.get('verdict') ?? undefined,
		scope: scopeParam(event.url.searchParams.get('scope')),
		hypothesis,
		leaf: event.url.searchParams.get('leaf') ?? undefined,
		offset: int('offset'),
		limit: int('limit')
	});
	if (requestId && !aggregate.request) {
		const lookup = findRequestByRef(
			view.draft.requests.filter((r) => r.status !== 'deleted'),
			requestId
		);
		error(lookup.kind === 'ambiguous' ? 400 : 404, unresolvedRequestReason(requestId, lookup));
	}
	if (aggregate.request) signalAiActivity(event, projectId, [aggregate.request.id], 'read');
	return json(aggregate);
};

/** Tries of one batch that met another write before writing anything; each re-reads the dossier. */
const CONFLICT_ATTEMPTS = 4;

/**
 * A 409 that wrote nothing: the dossier moved before this batch saved, so it
 * can run again on the fresh one. A refusal that names the sections it held
 * (land_section_changes) may have written some of them, and goes back to the caller.
 */
function retriableConflict(outcome: { ok: boolean; status?: number; results?: readonly { op: string }[] }): boolean {
	return !outcome.ok && outcome.status === 409 && !(outcome.results ?? []).some((r) => r.op === 'land_section_changes');
}

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		operations?: unknown;
		as_person?: unknown;
	} | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!Array.isArray(body?.operations) || body.operations.length === 0) {
		error(400, 'operations must be a non-empty array of { op, ... }');
	}
	const operations = body.operations as unknown[];
	// Community locks every Evolution act, never the answer to a click of Ask my AI (EVO-001).
	requireEvolutionBatchAccess(event.locals.services, operations);
	// A batch of what a viewer may make (a comment, an ask, a ruling...) needs the right to read; anything else, to write (issue 38).
	const access = accessNeededFor(operations);
	await requireProjectAccess(event, projectId, access);
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);

	const resolved = await resolveEvolutionActor(services, event, projectId, { asPerson: body?.as_person === true });
	// Let in on the right to read alone, the caller acts as a viewer whatever its workspace role, so each act applies the viewer's rules.
	const writes = access === 'write' || (await requireProjectAccess(event, projectId, 'write').then(() => true, () => false));
	const actor = writes ? resolved : { ...resolved, role: 'viewer' as const };
	const apply = () =>
		guardSectionWrite('evolution', () =>
			applyEvolutionOperations(services, {
				projectId,
				operations,
				actor,
				origin: event.request.headers.get('x-lyriks-client')
			})
		);
	// A batch says what to do, not what the dossier looked like: when another write
	// landed while it ran and nothing of it was written yet, it is applied again on
	// the dossier as it now stands, instead of sending the person back to retry by hand.
	let outcome = await apply();
	for (let attempt = 1; attempt < CONFLICT_ATTEMPTS && retriableConflict(outcome); attempt++) outcome = await apply();
	if (!outcome.ok) {
		return json(
			{
				ok: false,
				applied: false,
				results: outcome.results,
				message:
					outcome.status === 409
						? 'A section this batch writes changed while it was being applied. Read it again and retry.'
						: 'The batch was refused; nothing was applied. Each result names the operation and the reason.'
			},
			{ status: outcome.status }
		);
	}
	signalAiActivity(event, projectId, outcome.requests.map((r) => r.id), 'write');
	return json({
		ok: true,
		applied: true,
		results: outcome.results,
		revision: outcome.revision,
		savedAt: outcome.savedAt,
		requests: outcome.requests
	});
};
