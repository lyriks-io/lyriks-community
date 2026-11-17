import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The one language the project's spec is written in: declared in its
 * operating details, English otherwise. The notice says when the generated
 * texts fall back to English, and, when nothing is declared, when the prose
 * reads in another language. A declared language is answered from the
 * declaration alone: every AI read of a project asks this route, so it never
 * reads the features draft then (the project pages, which hold the features
 * already, also check a declared language against its prose).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	return json(await services.loadSpecLanguage.execute(projectId));
};
