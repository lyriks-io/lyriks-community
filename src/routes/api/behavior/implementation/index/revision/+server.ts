import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The revision of a project's implementation index, for whoever may write it
 * (feat-100, action aa15bfce): the MCP gateway asks it before handing out the
 * sync command, whose ticket writes the coverage the whole team reads, so a
 * viewer is refused (403) and someone outside the workspace finds no project
 * (404) before any ticket exists.
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	return json({ projectId, revision: await event.locals.services.guardIndexWrite.current(projectId) });
};
