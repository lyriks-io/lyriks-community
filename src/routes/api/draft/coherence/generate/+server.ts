import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { expectedRevision } from '$lib/server/draft-lock.server';
import type { RequestHandler } from './$types';

/**
 * Generate the structured Functional + Technical specs and the coherence graph
 * — server-side gated on a green, gap-free spec. Returns the updated draft with
 * the generated artifacts, then mirrors the envelope to Lyriks-back.
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');

	const services = getServices();
	const result = await services.generateSpecs.execute(projectId, {
		expectedRevision: expectedRevision(request),
		origin: request.headers.get('x-lyriks-client')
	});
	if (!result.ok && result.reason === 'conflict') error(409, 'This section was changed elsewhere.');
	if (result.ok) void services.pushEnvelopeToBack.execute(projectId);
	return json(result);
};
