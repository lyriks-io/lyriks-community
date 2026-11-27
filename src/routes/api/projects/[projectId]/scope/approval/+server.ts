import { error, json } from '@sveltejs/kit';
import { SCOPE_APPROVAL_AI_REFUSAL, SCOPE_APPROVAL_REFUSALS } from '$domain/scope';
import { callerKind } from '$lib/server/caller.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import type { RequestHandler } from './$types';

/**
 * Approve what the spec leaves out (action 6faa53cb): a person who may write
 * the project says yes to the list the drawer showed them (`shown`, its
 * fingerprint). Who and when are the session's and the server's (criterion
 * d16b352d). An AI client wrote the list, so it never approves it: refused
 * with 403 whatever it sends (its MCP exposure is withheld).
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	if (callerKind(event.request) === 'ai_client') error(403, SCOPE_APPROVAL_AI_REFUSAL);
	const body = (await event.request.json().catch(() => null)) as { shown?: unknown } | null;
	const shown = typeof body?.shown === 'string' ? body.shown : '';
	if (!shown) error(400, 'shown must be the fingerprint of the list the page showed');
	const services = event.locals.services;
	const person = await retrospecActor(services, projectId, event.cookies);
	const result = await services.approveScopeLeftOut.execute(projectId, shown, person.name);
	if (result === null) error(409, 'Someone saved the scope at the same moment. Read it again, then approve it.');
	if (!result.ok) error(409, SCOPE_APPROVAL_REFUSALS[result.refusal]);
	return json({ approval: { by: result.approval.by, at: result.approval.at } });
};
