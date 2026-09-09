import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { BehaviorMaturityReport } from '$application/ports';
import type { RequestHandler } from './$types';

/**
 * The engine names the weakest confidence dimension `confidence.overall`, which
 * reads like an aggregate score and is NOT one — a consumer (typically an LLM
 * over the MCP) quotes that `0` as "the score" instead of `percentage`, so the
 * value diverges from the `percentage` the app's feature drawer shows. Rename it
 * to `weakestScore` at this edge so the report carries no field masquerading as
 * an overall score; `percentage` stays the single headline. It already duplicates
 * `confidence.weakest.score`, so no information is lost.
 */
function unmaskConfidenceOverall(report: BehaviorMaturityReport): BehaviorMaturityReport {
	const r = report as Record<string, unknown>;
	const confidence = r.confidence;
	if (!confidence || typeof confidence !== 'object') return report;
	const c = confidence as Record<string, unknown>;
	if (!('overall' in c)) return report;
	const { overall, ...rest } = c;
	// The engine's own `hint` narrates the old field name; keep it in step.
	const hint =
		typeof r.hint === 'string' ? r.hint.replaceAll('`overall`', '`confidence.weakestScore`') : r.hint;
	return { ...report, confidence: { ...rest, weakestScore: overall }, hint };
}

/** Actionable maturity report with optional area, severity and surface filters. */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	const severity = params.get('severity');
	if (severity && severity !== 'critical' && severity !== 'recommended') {
		error(400, 'severity must be critical or recommended');
	}
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const report = await getServices().scoreBehaviorFeature.execute({
		featureId,
		includeIssues: params.get('includeIssues') !== 'false',
		surfaceId: params.get('surfaceId') ?? undefined,
		area: params.get('area') ?? undefined,
		severity: severity as 'critical' | 'recommended' | null ?? undefined
	});
	if (!report) error(503, 'Behavior engine unavailable');
	return json({
		available: true,
		report: unmaskConfidenceOverall(report),
		semantics: {
			percentage: 'The feature score. Structural completeness, 0-100 — matches the app.',
			confidenceWeakestScore: 'Score of the weakest confidence dimension, not the feature score.',
			issues: 'Included when includeIssues=true; filters scope issue counts but not feature-level confidence.'
		}
	});
};
