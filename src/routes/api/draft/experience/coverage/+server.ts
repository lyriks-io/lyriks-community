import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Read-only Step-05 plan-coverage / readiness report (the same analysis the
 * Experience tab shows): which journeys land on a screen, which features are
 * prototyped, dead actions, broken/orphan navigation, unused entities, plus the
 * 0–100 readiness score. Exposed so the Lyriks MCP can let an AI author → read
 * the concrete gaps (each with a screen/element ref) → patch exactly that, with
 * no need to pull the whole draft and re-derive completeness.
 *
 *   GET /api/draft/experience/coverage?projectId=<id>  ->  CoverageReport
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const report = await services.analyzeExperienceCoverage.execute(projectId);
	return json(report);
};
