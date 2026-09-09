import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Seed the simulator's fake backend from the real Step-07 data model: each
 * entity becomes an editable collection with the right field generator kinds, so
 * lists/forms in the prototype read the shapes the product will persist. Bulk
 * (all entities) by default, or a subset via `entityNames`. Idempotent — entities
 * whose name already backs a collection are skipped. With `refresh: true`,
 * drifted existing collections are refreshed from the model instead (seed counts
 * and authored rows are kept).
 *
 *   POST /api/draft/experience/import-collections
 *     { projectId, entityNames?: string[], refresh?: boolean }
 *       ->  ImportDataCollectionsResult
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as
		| { projectId?: unknown; entityNames?: unknown; refresh?: unknown }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const entityNames = Array.isArray(body?.entityNames)
		? body.entityNames.filter((x): x is string => typeof x === 'string')
		: undefined;
	const refresh = body?.refresh === true;

	const services = getServices();
	const result = await services.importDataCollections.execute(projectId, entityNames, {
		refresh
	});
	return json(result);
};
