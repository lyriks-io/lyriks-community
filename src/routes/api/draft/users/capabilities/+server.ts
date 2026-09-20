import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { capabilityRegistry } from '$application/capability-registry';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const [draft, derived] = await Promise.all([
		services.loadUsersDraft.execute(projectId), services.refreshDerivedCapabilities.execute(projectId)
	]);
	return json({ projectId, capabilities: capabilityRegistry(draft, derived) });
};
