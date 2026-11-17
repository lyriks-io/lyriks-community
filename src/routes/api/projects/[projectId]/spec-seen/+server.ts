import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { discussionAuthor } from '$lib/server/spec360-discussions.server';
import { markSpecSeen } from '$lib/server/spec-seen.server';
import type { RequestHandler } from './$types';

/**
 * The reader opened features of the Specification 360° (criterion b0950115):
 *   POST { ids: string[] } → { seen }
 * Reading the spec is enough: what one has read concerns no one else.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const body = (await event.request.json().catch(() => null)) as { ids?: unknown } | null;
	const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && id !== '') : [];
	if (ids.length === 0) error(400, 'Send { ids: string[] }.');
	const services = event.locals.services;
	const reader = await discussionAuthor(services, projectId, event.cookies);
	return json({ seen: await markSpecSeen(services, projectId, reader.email, ids, new Date().toISOString()) });
};
