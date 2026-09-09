import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Reuse-library actions for a project: export a feature to the shared library,
 * import a template as a new feature (writes the kernel via the Features path),
 * or remove a template. One endpoint keyed by `action`.
 */
export const POST: RequestHandler = async (event) => {
	const { request, params } = event;
	const projectId = params.projectId;
	await requireProjectAccess(event, projectId, 'write');
	const body = (await request.json().catch(() => ({}))) as {
		action?: unknown;
		featureId?: unknown;
		templateId?: unknown;
	};
	const services = getServices();

	if (body.action === 'export' && typeof body.featureId === 'string') {
		const library = await services.exportRequirement.execute(projectId, body.featureId);
		return json({ library });
	}
	if (body.action === 'import' && typeof body.templateId === 'string') {
		const result = await services.importRequirement.execute(projectId, body.templateId);
		return json(result);
	}
	if (body.action === 'remove' && typeof body.templateId === 'string') {
		const library = await services.removeReuseTemplate.execute(body.templateId);
		return json({ library });
	}
	error(400, 'invalid reuse action');
};
