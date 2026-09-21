import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { BEHAVIOR_AUTHORING_PATTERNS, BEHAVIOR_NAMING_RULES } from '$application/behavior-authoring-patterns';
import type { RequestHandler } from './$types';

/**
 * Version-aligned apply_batch operation guide read from the isolated engine.
 *
 * `projectId` is optional: the vocabulary is the engine's own and identical for
 * every project, so it must be readable before the first project exists. With
 * an id, the usual per-project authorization applies; without one, a signed-in
 * caller is enough wherever auth is enforced.
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (projectId) await requireProjectAccess(event, projectId, 'read');
	else if (event.locals.authRequired && !event.locals.session?.email) error(401, 'unauthenticated');

	const kind = event.url.searchParams.get('kind')?.trim() || undefined;
	const result = await getServices().readBehaviorOperations.execute(kind);
	if (!result) error(503, 'Behavior engine unavailable');
	return kind
		? json({ available: true, kind, description: result })
		: json({
				available: true,
				reference: result,
				patterns: BEHAVIOR_AUTHORING_PATTERNS,
				namingRules: BEHAVIOR_NAMING_RULES
			});
};
