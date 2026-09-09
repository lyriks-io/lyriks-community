import { json, text, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { TargetMap } from '$domain/experience';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Generate runnable acceptance tests from the verified prototype — the artifact
 * that carries simulator verification into the build. Returns JSON
 * `{ gherkin, playwright, journeyCount, criteriaCount, boundAssertions, ... }`;
 * `?format=gherkin|playwright` returns just that file as plain text.
 *
 *   GET  /api/draft/experience/acceptance-tests?projectId=<id>[&format=…]
 *   POST same, with a body `{ projectId, map?, format? }` to retarget an existing
 *        repo via a TargetMap (real routes / selectors / observables).
 *
 * A generated file is the specification carried out of the product, so it is
 * a writer's action (designer and above), like the project export.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	return respond(projectId, undefined, url.searchParams.get('format'));
};

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const body = (await request.json().catch(() => null)) as
		| { projectId?: unknown; map?: TargetMap; format?: unknown }
		| null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	return respond(projectId, body?.map, typeof body?.format === 'string' ? body.format : null);
};

async function respond(projectId: string, map: TargetMap | undefined, format: string | null) {
	const result = await getServices().generateAcceptanceTests.execute(projectId, map);
	if (format === 'gherkin') return text(result.gherkin, { headers: { 'content-type': 'text/plain' } });
	if (format === 'playwright')
		return text(result.playwright, { headers: { 'content-type': 'text/plain' } });
	return json(result);
}
