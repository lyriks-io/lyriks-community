import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { TargetMap } from '$domain/experience';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * A drop-in acceptance bundle (specs + playwright config + CI workflow +
 * lyriks.map.json + README) for any repo — the provider-agnostic way to carry
 * the verified prototype's contract into greenfield OR existing codebases. An
 * AI/human commits the returned files. Pass a `map` to retarget onto an existing
 * app's routes/selectors.
 *
 *   GET  /api/draft/experience/repo-scaffold?projectId=<id>
 *   POST same, body `{ projectId, map? }`  ->  { files: [{path, content}], summary }
 *
 * A generated file is the specification carried out of the product, so it is
 * a writer's action (designer and above), like the project export.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	return json(await getServices().generateRepoScaffold.execute(projectId));
};

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as
		| { projectId?: unknown; map?: TargetMap }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	return json(await getServices().generateRepoScaffold.execute(projectId, body?.map));
};
