import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import {
	DOSSIER_PARTS,
	evolutionAggregate,
	isDossierPart,
	loadEvolutionView
} from '$lib/server/evolution-view.server';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import { isImpactHypothesis } from '$domain/evolution';
import type { RequestHandler } from './$types';

/**
 * The Evolution section as ONE aggregate, readable and drivable in single
 * calls, so an MCP client runs a request from the raw need to acceptance
 * without recomputing the dossier's rules from the raw section document.
 *
 *   GET  /api/evolution?projectId=<id>[&requestId=<id>][&part=fields|proposals|impact|report|readings|history]
 *        -> the board (every live request as a card), one dossier in counts,
 *           or one list of it, narrowed by `leaf` / `section` / `verdict` and
 *           paged by `offset` / `limit`.
 *   POST /api/evolution { projectId, operations[], as_person? }
 *        -> typed operations, applied atomically under the server's guards.
 *
 * Who is acting is resolved server-side (see evolution-actor.server.ts): the
 * MCP names itself as an AI client, and `as_person: true` relays the signed-in
 * person's own decision with the channel stamped on the timeline.
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);
	const [view, actor] = await Promise.all([
		loadEvolutionView(services, projectId, { activeWorkspaceId: event.cookies.get('lyriks_active_ws') }),
		resolveEvolutionActor(services, event)
	]);
	const requestId = event.url.searchParams.get('requestId') ?? undefined;
	const part = event.url.searchParams.get('part') ?? undefined;
	if (part !== undefined && !isDossierPart(part)) {
		error(400, `unknown part "${part}". Valid: ${DOSSIER_PARTS.join(', ')}`);
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
	const aggregate = evolutionAggregate(view, actor, requestId, {
		part,
		section: event.url.searchParams.get('section') ?? undefined,
		verdict: event.url.searchParams.get('verdict') ?? undefined,
		hypothesis,
		leaf: event.url.searchParams.get('leaf') ?? undefined,
		offset: int('offset'),
		limit: int('limit')
	});
	if (requestId && !aggregate.request) error(404, `Request "${requestId}" does not exist on this project.`);
	return json(aggregate);
};

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
	await requireProjectAccess(event, projectId, 'write');
	const services = getServices();
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);

	const actor = await resolveEvolutionActor(services, event, { asPerson: body?.as_person === true });
	const outcome = await guardSectionWrite('evolution', () =>
		applyEvolutionOperations(services, {
			projectId,
			operations: body!.operations as unknown[],
			actor,
			origin: event.request.headers.get('x-lyriks-client'),
			activeWorkspaceId: event.cookies.get('lyriks_active_ws')
		})
	);
	if (!outcome.ok) {
		return json(
			{
				ok: false,
				applied: false,
				results: outcome.results,
				message:
					outcome.status === 409
						? 'The evolution section changed while the batch was being applied. Read it again and retry.'
						: 'The batch was refused; nothing was applied. Each result names the operation and the reason.'
			},
			{ status: outcome.status }
		);
	}
	return json({
		ok: true,
		applied: true,
		results: outcome.results,
		revision: outcome.revision,
		savedAt: outcome.savedAt,
		requests: outcome.requests
	});
};
