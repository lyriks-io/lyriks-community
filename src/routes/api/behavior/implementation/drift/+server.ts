import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import type { BehavioralIndexPayload } from '$application/ports';
import type { RequestHandler } from './$types';

/**
 * Spec → code drift: which implementations were audited against an OLDER
 * version of the spec than the one now in the kernel, so the code may no longer
 * match. Returns `stale` (re-audit — the spec moved under them), `unversioned`
 * (audited but never stamped, so drift can't be judged) and `orphans` (index
 * keys that no longer resolve to any spec entity).
 *
 * This is the payoff of adoption: seeding the index stamps a `specVersion` on
 * every entry, which is what makes this answer meaningful from day one.
 *
 * POST for the same reason as `../gaps` — the index rides in the body. Read-only.
 * Omit `featureId` to judge the whole project.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		index?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!body?.index || typeof body.index !== 'object' || Array.isArray(body.index)) {
		error(400, 'index must be an object keyed by "<type>:<id>"');
	}

	const featureId = typeof body.featureId === 'string' ? body.featureId : '';
	if (featureId) {
		await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	} else {
		await requireProjectAccess(event, projectId, 'read');
	}

	return adoptionJson(
		await getServices().codeAdoption.getImplementationDrift(
			projectId,
			body.index as BehavioralIndexPayload,
			featureId || undefined
		)
	);
};
