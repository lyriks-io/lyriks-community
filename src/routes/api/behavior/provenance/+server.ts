import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import type { RequestHandler } from './$types';

/**
 * What a feature's model is made of: which element came from which source span,
 * which candidates are still parked, which contradictions are open — and, with
 * `coverage=true`, how much of each attached source has actually been consumed.
 *
 * Read this before `finalize`: the two answers together are exactly what the
 * gate will check, so an agent can see why it will be refused before it asks.
 */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const adoption = getServices().codeAdoption;

	if (params.get('coverage') === 'true') {
		const sourceId = params.get('sourceId') ?? undefined;
		return adoptionJson(await adoption.getSourceCoverage(featureId, sourceId));
	}
	return adoptionJson(await adoption.getProvenance(featureId));
};
