import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { expectedRevision } from '$lib/server/draft-lock.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireProjectAccess(event, event.params.projectId, 'read');
	if (
		!(await getServices().listProjects.execute()).some(
			(project) => project.id === event.params.projectId
		)
	) {
		error(404, 'Project not found');
	}
	return json(await getServices().assessProjectCompleteness.execute(event.params.projectId));
};

/**
 * `audit` snapshots the current scope + model signatures. `finish` succeeds only
 * against that fresh snapshot and returns the complete blocker report otherwise.
 */
export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	if (!(await getServices().listProjects.execute()).some((project) => project.id === projectId)) {
		error(404, 'Project not found');
	}
	const body = (await event.request.json().catch(() => null)) as { action?: unknown } | null;
	const action = body?.action;
	if (action !== 'audit' && action !== 'finish') {
		error(400, 'action must be "audit" or "finish"');
	}
	const save = {
		expectedRevision: expectedRevision(event.request),
		origin: event.request.headers.get('x-lyriks-client')
	};
	const services = getServices();
	const result =
		action === 'audit'
			? await services.auditProjectScope.execute(projectId, save)
			: await services.finishProject.execute(projectId, save);
	if (result === null) {
		error(409, 'This scope changed while the project was being assessed. Reload and try again.');
	}
	return json(result);
};
