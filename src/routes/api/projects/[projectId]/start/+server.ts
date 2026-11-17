import { error, json } from '@sveltejs/kit';
import { isStartWay } from '$domain/portfolio/project-start';
import { currentPersonId } from '$lib/server/evolution-actor.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { saveProjectStart } from '$lib/server/project-start.server';
import type { RequestHandler } from './$types';

/**
 * How the project was started, as the "Create your project" dialog chose it.
 *
 *   POST `{ way }` → records it (`code`, `docs`, `code_and_docs`, `manual` or
 *        `scratch`) and answers `{ ok: true }`. The app bar opens the project's
 *        tabs from it.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const body = (await event.request.json().catch(() => null)) as { way?: unknown } | null;
	if (!isStartWay(body?.way)) error(400, 'way is one of code, docs, code_and_docs, manual, scratch');
	await saveProjectStart(services, projectId, { way: body.way, at: new Date().toISOString(), by: currentPersonId(services) });
	return json({ ok: true });
};
