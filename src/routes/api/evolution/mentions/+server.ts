import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { nodeSourceHref } from '$domain/graph/node-link';
import { isMentionKind, pickMentions, type MentionCandidate } from '$lib/domain/evolution';
import type { RequestHandler } from './$types';

/**
 * What a text of the Functional spec may cite (ac-evo-func-mention): the
 * features, screens and rules of the knowledge graph, and the glossary terms.
 *
 *   GET /api/evolution/mentions?projectId=<id>&q=<typed after @>
 *   GET /api/evolution/mentions?projectId=<id>&refs=<kind:id,...>  (the cited ones that still exist)
 */
export const GET: RequestHandler = async (event) => {
	requireEvolutionAccess(event.locals.services);
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	const [graph, glossary] = await Promise.all([
		services.loadMergedKnowledgeGraph.execute(projectId),
		services.loadGlossaryDraft.execute(projectId)
	]);
	const all: MentionCandidate[] = [
		...graph.nodes
			.filter((n) => isMentionKind(n.kind) && n.label.trim() !== '')
			.map((n) => ({ ref: n.id, kind: n.kind as MentionCandidate['kind'], name: n.label, href: nodeSourceHref(projectId, n) })),
		...glossary.terms
			.filter((t) => t.term.trim() !== '')
			.map((t) => ({ ref: `term:${t.id}`, kind: 'term' as const, name: t.term, href: `/projects/${projectId}/glossary?node=${encodeURIComponent(t.id)}` }))
	];
	const refs = event.url.searchParams.get('refs');
	return json({
		candidates: pickMentions(all, refs !== null ? { refs: refs.split(',').filter(Boolean) } : { q: event.url.searchParams.get('q') ?? '' })
	});
};
