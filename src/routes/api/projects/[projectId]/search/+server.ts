import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { nodeSourceHref, nodeContextLabel } from '$domain/graph/node-link';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Project-scoped search index. Reuses the existing knowledge-graph projection
 * (wizard-only — offline-safe, no engine) as the flat list of every object in
 * the project, and precomputes each result's deep link with `nodeSourceHref`.
 * The client fetches this once and filters as-you-type — no new search infra,
 * no per-keystroke server round-trip.
 */
export const GET: RequestHandler = async (event) => {
	const { params } = event;
	await requireProjectAccess(event, params.projectId, 'read');
	const graph = await getServices().loadKnowledgeGraph.execute(params.projectId);
	const items = graph.nodes
		.map((node) => {
			const href = nodeSourceHref(params.projectId, node);
			return href
				? {
						id: node.id,
						kind: node.kind,
						label: node.label,
						detail: node.detail ?? '',
						context: nodeContextLabel(node.context),
						href
					}
				: null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);
	return json({ items });
};
