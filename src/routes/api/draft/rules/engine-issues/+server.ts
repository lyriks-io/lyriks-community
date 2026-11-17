import { json, error } from '@sveltejs/kit';
import { advisoriesToCandidateIssues } from '$application/analysis/advisories-to-issues';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Engine findings for the Issues board's automatic scan: the cached unspa behavior
 * advisories (invariant violations, failing scenarios, critical spec gaps)
 * mapped to candidate issues, so engine analysis and the local heuristics feed
 * the same triage inbox. Served from the cached snapshot — never blocks on the
 * engine; a cold cache returns [] and warms in the background (project pages
 * keep it warm via the coherence checker).
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	if (!services.advisorAvailable()) return json({ available: false, findings: [] });
	const [advisories, lang] = await Promise.all([
		services.behaviorAdvisories.get(projectId),
		services.loadSpecLanguage.generated(projectId)
	]);
	return json({ available: true, findings: advisoriesToCandidateIssues(advisories, lang) });
};
