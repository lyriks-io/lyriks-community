import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { readCodeEvidence } from '$lib/server/spec360-code-evidence.server';
import type { RequestHandler } from './$types';

/**
 * The evidence behind a place in the code a feature page shows
 * (ac-src-code-place).
 *
 *   GET ?feature=<leafId>&file=<path>&line=<n>&element=<id> → CodeEvidence | 404
 *
 * Reading the spec is enough: the excerpt is the project's own evidence.
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const q = event.url.searchParams;
	const featureId = q.get('feature') ?? '';
	const file = q.get('file') ?? '';
	if (!featureId || !file) error(400, 'A place names its feature and its file.');
	const line = Number.parseInt(q.get('line') ?? '', 10);
	const element = q.get('element') ?? '';
	const recorded = q.get('recorded') ?? '';
	const evidence = await readCodeEvidence(event.locals.services, projectId, featureId, {
		file,
		line: Number.isFinite(line) ? line : null,
		...(element ? { elementId: element } : {}),
		...(recorded ? { recorded } : {})
	});
	if (!evidence) error(404, 'This feature is not one of the project.');
	return json(evidence);
};
