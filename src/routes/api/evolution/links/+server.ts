import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { nodeSourceHref } from '$domain/graph/node-link';
import { linkCandidates, pickLinks } from '$lib/domain/evolution';
import type { DiagramLinkKind } from '$lib/domain/evolution';
import type { RequestHandler } from './$types';

/**
 * What an element of a diagram may be linked to (ac-evo-func-uml-link,
 * ac-evo-tech-uml-link): the project's features, the actions their behaviour
 * models hold, and the tables of its Data model.
 *
 *   GET /api/evolution/links?projectId=<id>&kind=feature|action|entity&q=<typed>
 *   GET /api/evolution/links?projectId=<id>&refs=<ref,...>  (the linked ones that still exist)
 */
const KINDS: readonly DiagramLinkKind[] = ['feature', 'action', 'entity'];

export const GET: RequestHandler = async (event) => {
	requireEvolutionAccess(event.locals.services);
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const graph = await event.locals.services.loadMergedKnowledgeGraph.execute(projectId);
	const all = linkCandidates(graph, (node) => nodeSourceHref(projectId, node));
	const refs = event.url.searchParams.get('refs');
	const kind = KINDS.find((k) => k === event.url.searchParams.get('kind'));
	return json({
		candidates: pickLinks(all, refs !== null ? { refs: refs.split(',').filter(Boolean) } : { q: event.url.searchParams.get('q') ?? '', kind })
	});
};
