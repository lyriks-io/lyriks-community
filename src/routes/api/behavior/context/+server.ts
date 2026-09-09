import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The id bridge (Fix #2): resolve a wizard journey/step/screen/surface/action id
 * into its kernel address — `{ featureId, surfaceId, actionId, depth }` — so an
 * author can jump straight into apply_behavior_batch without hand-translating
 * `journey-triage → srf-journey-triage`. Read-only; gated on read access to the
 * project (the target is always that project's Experience feature).
 *
 * Query: `projectId` (required) + exactly one of `journeyId | stepId | screenId |
 * surfaceId | actionId`. With none, returns just the resolved `featureId`.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');

	await requireProjectAccess(event, projectId, 'read');

	const context = await getServices().resolveBehaviorContext.execute({
		projectId,
		journeyId: url.searchParams.get('journeyId') ?? undefined,
		stepId: url.searchParams.get('stepId') ?? undefined,
		screenId: url.searchParams.get('screenId') ?? undefined,
		surfaceId: url.searchParams.get('surfaceId') ?? undefined,
		actionId: url.searchParams.get('actionId') ?? undefined
	});
	return json({
		context,
		idNamespaces: {
			projectId: 'Wizard project slug used by all v3 section and experience tools.',
			featureId: 'Kernel feature id: a leaf id or the generated <projectId>__experience / <projectId>__data_model id.',
			surfaceId: 'Kernel surface id resolved from a wizard journey or screen id.',
			actionId: 'Kernel action id resolved from a wizard step id.'
		}
	});
};
