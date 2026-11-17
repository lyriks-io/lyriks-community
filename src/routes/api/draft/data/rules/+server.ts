import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { callerKind } from '$lib/server/caller.server';
import type { RequestHandler } from './$types';

/**
 * The data model's rules as the Rules reading shows them: each EARS sentence,
 * how it is known, the state its field is tied to and what it still waits for,
 * with the states a field or a table could be tied to. Instant: the solver's
 * verdicts come apart (./verdicts).
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const reading = await event.locals.services.readDataRules.read(projectId);
	if (!reading) error(404, 'No data model yet.');
	return json(reading);
};

/**
 * Tie a field to the state that carries it, untie it, or name the state that
 * says a record of a table exists. Body: `{ projectId, action: "tie", fieldId,
 * statePath }`, `{ projectId, action: "untie", fieldId }` or `{ projectId,
 * action: "existence", entityId, statePath | null }`. It changes what the solver
 * checks, so it needs a writing role. The answer says how the rules moved.
 * Who ties is read from the request, never from the endpoint: an AI client
 * calling it is not a person, and cannot undo a person's unlink.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const str = (key: string) => (typeof body?.[key] === 'string' ? (body[key] as string) : '');
	const tie = event.locals.services.tieDataField;
	const author = callerKind(event.request) === 'ai_client' ? 'ai-client' : 'person';
	const result =
		body?.action === 'tie' && str('fieldId') && str('statePath')
			? await tie.tie(projectId, str('fieldId'), str('statePath'), author)
			: body?.action === 'untie' && str('fieldId')
				? await tie.untie(projectId, str('fieldId'), author)
				: body?.action === 'existence' && str('entityId')
					? await tie.nameExistence(projectId, str('entityId'), str('statePath') || null)
					: null;
	if (!result) error(400, 'action must be tie (fieldId, statePath), untie (fieldId) or existence (entityId, statePath)');
	if (!result.ok) return json({ ok: false, error: result.error }, { status: result.status });
	return json(result);
};
