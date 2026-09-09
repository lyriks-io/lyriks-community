import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/** Version-aligned apply_batch operation guide read from the isolated engine. */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');

	const kind = event.url.searchParams.get('kind')?.trim() || undefined;
	const result = await getServices().readBehaviorOperations.execute(kind);
	if (!result) error(503, 'Behavior engine unavailable');
	return kind
		? json({ available: true, kind, description: result })
		: json({ available: true, reference: result });
};
