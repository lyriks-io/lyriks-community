import { error, json } from '@sveltejs/kit';
import { markAllRead, markRead } from '$domain/activity';
import { currentPersonId } from '$lib/server/evolution-actor.server';
import { parseBellId } from '$lib/server/app-chrome-data.server';
import { loadReads, saveReads, visibleProjects } from '$lib/server/project-activity.server';
import type { RequestHandler } from './$types';

/**
 * The reader marks notifications read: some (`ids`, as the bell names them),
 * or every one (`all`) across the projects they can see. Only their own read
 * marks change; the work the notifications report is untouched.
 */
export const POST: RequestHandler = async (event) => {
	if (event.locals.authRequired && !event.locals.session?.isAuthenticated) error(401, 'unauthenticated');
	const body = (await event.request.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;
	if (!body) error(400, 'JSON body is required');
	const services = event.locals.services;
	const me = currentPersonId(services);
	const projects = await visibleProjects(services, event);
	const visible = new Set(projects.map((p) => p.id));

	if (body.all === true) {
		const now = new Date().toISOString();
		await Promise.all(projects.map(async (p) => saveReads(services, p.id, me, markAllRead(await loadReads(services, p.id, me), now))));
		return json({ ok: true });
	}
	if (!Array.isArray(body.ids)) error(400, 'ids or all is required');
	const byProject = new Map<string, string[]>();
	for (const raw of body.ids) {
		const parsed = typeof raw === 'string' ? parseBellId(raw) : null;
		if (!parsed || !visible.has(parsed.projectId)) continue;
		byProject.set(parsed.projectId, [...(byProject.get(parsed.projectId) ?? []), parsed.eventId]);
	}
	await Promise.all(
		[...byProject].map(async ([projectId, ids]) => saveReads(services, projectId, me, markRead(await loadReads(services, projectId, me), ids)))
	);
	return json({ ok: true });
};
