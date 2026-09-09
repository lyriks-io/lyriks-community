import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { expectedRevision } from '$lib/server/draft-lock.server';
import type { RequestHandler } from './$types';

/**
 * Capture a new immutable baseline. Server-side: it assembles the whole spec
 * envelope and composes the requirements-document snapshot, so it cannot be a
 * plain client autosave. Appends directly to the baselines residue and returns
 * the updated draft; the client re-hydrates from it.
 */
export const POST: RequestHandler = async (event) => {
	const { request, params } = event;
	const projectId = params.projectId;
	await requireProjectAccess(event, projectId, 'write');
	const body = (await request.json().catch(() => ({}))) as { name?: unknown; note?: unknown };
	const name = typeof body.name === 'string' ? body.name : '';
	const note = typeof body.note === 'string' ? body.note : '';
	if (!projectId) error(400, 'projectId is required');

	const result = await getServices().captureBaseline.execute(projectId, name, note, {
		expectedRevision: expectedRevision(request),
		origin: request.headers.get('x-lyriks-client')
	});
	if (result === null) error(409, 'This section was changed by someone else.');
	return json(result);
};
