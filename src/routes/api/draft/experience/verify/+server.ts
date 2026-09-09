import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Build-readiness verdict for the Experience prototype — the bridge from
 * "prototype" to "build constraint". Runs plan-coverage, simulates every
 * journey's derived happy-path, and emits the Gherkin acceptance spec, then
 * rolls it up into a single ready/not-ready answer with the blockers. Exposed so
 * the MCP can tell an AI whether the prototype is verified end-to-end before it
 * generates product code, and hand it the acceptance criteria the build must meet.
 *
 *   GET /api/draft/experience/verify?projectId=<id>  ->  VerifyExperienceResult
 *
 * Optional spec-gap scoping (counts stay global; only the detailed list pages):
 *   &gapSeverity=critical|recommended  &gapLimit=<n>  &gapOffset=<n>
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');

	const severityRaw = url.searchParams.get('gapSeverity');
	if (severityRaw && severityRaw !== 'critical' && severityRaw !== 'recommended')
		error(400, 'gapSeverity must be "critical" or "recommended"');
	const intParam = (name: string): number | undefined => {
		const raw = url.searchParams.get(name);
		if (raw === null) return undefined;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 0) error(400, `${name} must be a non-negative integer`);
		return n;
	};

	const services = getServices();
	const result = await services.verifyExperience.execute(projectId, {
		specGaps: {
			severity: (severityRaw as 'critical' | 'recommended' | null) ?? undefined,
			limit: intParam('gapLimit'),
			offset: intParam('gapOffset')
		}
	});
	return json(result);
};
