import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * One leaf feature's behavioral maturity WITH the checks it failed: what the
 * drawer's "Next level" card is made of.
 *
 * Deliberately its own endpoint rather than a field on `/api/features/behavior`.
 * That one waits on the engine advisor (scenarios, model check), which takes
 * seconds on a richly modelled feature and answers `available:false` when the
 * engine is off. This read is a pure local scoring of the shell, so it lands
 * immediately and keeps answering on an air-gapped appliance. Bundling the two
 * would have made the cheap reading wait for the expensive one.
 *
 * Authorization: same gate as the behavior endpoint. The scorer resolves a
 * feature by id, so the caller must have read access to `projectId` AND the
 * feature must belong to it.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const featureId = url.searchParams.get('featureId') ?? '';
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!featureId || !projectId) return json({ maturity: null }, { status: 400 });

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');

	const maturity = await getServices().loadFeatureMaturityReport.execute(projectId, featureId);
	return json({ maturity });
};
