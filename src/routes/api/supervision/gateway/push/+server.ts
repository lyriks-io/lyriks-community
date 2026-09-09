import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { expectedRevision } from '$lib/server/draft-lock.server';
import type { RequestHandler } from './$types';

/**
 * Provision one REAL LiteLLM virtual key per Supervision member (each with its
 * own monthly budget) via the opt-in gateway adapter, then mirror the applied
 * per-member spend back into the Supervision draft. No-ops when no proxy is wired.
 */
export const PUT: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');

	const services = getServices();
	const result = await services.pushMemberKeys.execute(projectId, {
		expectedRevision: expectedRevision(request),
		origin: request.headers.get('x-lyriks-client')
	});
	if (result.configured && result.revision === null) error(409, 'This section was changed elsewhere.');
	if (result.configured) {
		void services.pushEnvelopeToBack.execute(projectId);
	}
	return json(result);
};
