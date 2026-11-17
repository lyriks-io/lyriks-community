import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { discussionAuthor, discussionRoster } from '$lib/server/spec360-discussions.server';
import { openDiscussionCount, parseDiscussionAct } from '$domain/discussions';
import type { RequestHandler } from './$types';

/**
 * The Specification 360° discussions of one project.
 *
 *   GET  → { document, revision, openCount }
 *   POST { act } → { document, revision, threadId } | 422 refusal | 409 conflict
 *
 * Reading the spec is enough to discuss it: a discussion changes nothing in
 * the spec, and the people a spec is published to (reviewers, viewers) are
 * exactly the ones who ask questions about it. Who writes is resolved from the
 * session, never read from the body.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const { document, revision } = await event.locals.services.loadDiscussions.execute(projectId);
	return json({ document, revision, openCount: openDiscussionCount(document) });
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const body = (await event.request.json().catch(() => null)) as { act?: unknown } | null;
	const parsed = parseDiscussionAct(body?.act);
	if (!parsed.ok) error(400, parsed.refusal);

	const services = event.locals.services;
	const author = await discussionAuthor(services, event.cookies);
	let act = parsed.act;
	if (act.kind === 'open' && act.notify.length > 0) {
		// Only colleagues of this project can be notified: an address typed into
		// the request would otherwise turn a thread into a mailer.
		const roster = new Set((await discussionRoster(services, projectId, event.cookies)).map((p) => p.email));
		act = { ...act, notify: act.notify.filter((email) => roster.has(email.trim().toLowerCase())) };
	}
	const result = await services.actOnDiscussion.execute(
		projectId,
		act,
		author,
		event.request.headers.get('x-lyriks-client')
	);
	if (!result.ok) return json({ refusal: result.refusal }, { status: result.conflict ? 409 : 422 });
	return json({ document: result.document, revision: result.revision, threadId: result.thread.id });
};
