import { error, json } from '@sveltejs/kit';
import { parseRetrospecActs } from '$application/retrospec/parse-retrospec-acts';
import { loadRetrospecDocument, readSectionRevisions, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import { RETROSPEC_SECTIONS, applyRetrospecActs, retrospecBaseline, type RetrospecAct, type RetrospecScope } from '$domain/retrospec';
import { analysisOver } from '$domain/retrospec/reverse-page';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { readSpecElements } from '$lib/server/spec-elements.server';
import { nextRunScope, readRetrospecEvents, readRetrospecStatus, retrospecActor } from '$lib/server/retrospec-status.server';
import { callerKind } from '$lib/server/caller.server';
import type { RequestHandler } from './$types';

const fingerprintsOf = (elements: readonly { readonly id: string; readonly fingerprint?: string | null }[]) =>
	Object.fromEntries(elements.flatMap((e) => (e.fingerprint ? [[e.id, e.fingerprint] as const] : [])));

/**
 * The retrospecification of one project.
 *
 *   GET  → `{ status }`, and `events` too with `?events=1` (newest first).
 *   POST `{ acts: [...] }` → applies a person's acts (start, launch, validate,
 *        reject, set aside, share, comment, publish…) and answers `{ ok, revision }`.
 *
 * A start records the specification's revisions as the run's baseline, read
 * here, never from the body. A publish first captures a baseline of the
 * specification (the immutable snapshot Traceability lists), then records it on
 * the run; an act the run refuses answers 400 with its reason, before anything
 * is captured.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const [status, events] = await Promise.all([
		readRetrospecStatus(event.locals.services, projectId),
		event.url.searchParams.get('events') === '1' ? readRetrospecEvents(event.locals.services, projectId) : Promise.resolve(undefined)
	]);
	return json(events ? { status, events } : { status });
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseRetrospecActs(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	// A person decides what enters the specification, never their AI (criterion 50b00229).
	if (callerKind(event.request) === 'ai_client' && parsed.acts.some((a) => a.op === 'decide_change' || a.op === 'validate_changes' || a.op === 'open_writing')) error(403, 'A person decides on a change of the report, never their AI.');
	const origin = event.request.headers.get('x-lyriks-client');
	const actor = await retrospecActor(services, event.cookies);
	const now = new Date().toISOString();

	const needsBaseline = parsed.acts.some((a) => a.op === 'start');
	const baseline = needsBaseline
		? retrospecBaseline(await readSectionRevisions(services.sectionDocuments, services.draftLock, projectId, RETROSPEC_SECTIONS))
		: {};
	// What each element reads as the run starts: the validations it carries stand against it when the last validated run recorded nothing (criterion 0c87480c).
	const elements = needsBaseline ? await readSpecElements(services, projectId).catch(() => []) : [];
	const fingerprints = fingerprintsOf(elements);
	// Their names too: an element a later run removes has nothing else left to be named by (criterion 03192a6e).
	const titles = Object.fromEntries(elements.map((e) => [e.id, e.title]));
	// What a later run reads unless the person chooses otherwise: the whole product when the last run stopped short or no delta can be read (criterion 98612117).
	const scope: RetrospecScope = needsBaseline ? await nextRunScope(services, projectId) : 'delta';
	// Whether the analysis of the last run is over, read here, never from the body: a start then closes that run (criterion 2dbed801).
	const closesRun = needsBaseline && analysisOver((await readRetrospecStatus(services, projectId)).status);
	const resolve = (baselineId: string | null): RetrospecAct[] =>
		parsed.acts.map((a): RetrospecAct => (a.op === 'start' ? { op: 'start', mode: a.mode, baseline, fingerprints, titles, scope, closesRun } : a.op === 'publish' ? { op: 'publish', baselineId } : a));

	let baselineId: string | null = null;
	if (parsed.acts.some((a) => a.op === 'publish')) {
		// Refused acts never leave a baseline behind them: try the batch first.
		const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
		const dry = applyRetrospecActs(doc, resolve(null), { actor, now });
		if (!dry.ok) error(400, dry.reason);
		const identity = await services.loadFoundationDraft.loadIdentity(projectId);
		const product = identity.productName.trim() || 'the product';
		const captured = await services.captureBaseline.execute(projectId, `Reverse-Specification of ${product}`, `Published from the Reverse-Specification by ${actor.name}.`, { expectedRevision: null, origin });
		if (!captured) error(409, 'The baselines changed while publishing. Try again.');
		baselineId = captured.draft.baselines[0]?.id ?? null;
	}

	const outcome = await saveRetrospecActs(services.sectionDocuments, projectId, resolve(baselineId), { actor, now }, origin);
	if (!outcome.ok) error(outcome.conflict ? 409 : 400, outcome.reason);
	return json({ ok: true, revision: outcome.revision });
};
