import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Ask the Unspaghettit engine to score + find gaps for every leaf Feature
 * in the project's Step 04 draft. Returns `{ available, advice }`. When the
 * advisor subprocess can't be reached, `available: false` + `advice: []` so
 * the UI degrades gracefully.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) return json({ available: false, advice: [] }, { status: 400 });
	await requireProjectAccess(event, projectId, 'read');
	const services = getServices();
	const available = services.advisorAvailable();
	// Served from the cached advisor: instant snapshot, engine scoring refreshed in
	// the background (see CachedFeatureAdvisor) — never blocks the request.
	const advice = available ? await services.featureAdvice.get(projectId) : [];
	return json({ available, advice });
};
