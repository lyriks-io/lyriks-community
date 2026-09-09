import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { graphOverview, scopeGraph } from '$domain/graph';
import type { GraphContext, GraphNodeKind, GraphScope } from '$domain/graph';
import type { RequestHandler } from './$types';

/** "a,b , c" -> ["a","b","c"]; null/empty -> undefined (param absent). */
function csv(value: string | null): string[] | undefined {
	const items = (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

/** Positive integer param, or undefined when absent/malformed. */
function positiveInt(value: string | null): number | undefined {
	if (value === null) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The central knowledge graph for a project — every bounded context folded into
 * one node/edge graph. Read-only derived view; the per-context drafts remain
 * authoritative. Backs the graph explorer and any external graph consumer
 * (notably the `get_knowledge_graph` MCP tool).
 *
 * Scoping (all optional, combinable — no params returns the full graph):
 * - `view=overview`: whole-graph stats + best-connected nodes, no edge dump.
 * - `contexts=` / `kinds=`: comma-separated node filters.
 * - `q=`: case-insensitive substring match on label / detail / id.
 * - `focus=` (+ `depth=`): undirected neighborhood around one node id.
 * - `limit=`: node cap; the best-connected matches win, `truncated` is flagged.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	// DEFAULT (`merged`): local projection + unspa behavior, plus the DPO verdict
	// in Enterprise. `source=engine` is policy-gated to Enterprise and returns its raw substrate;
	// `source=local` returns the wizard projection alone.
	const param = url.searchParams.get('source');
	const services = getServices();
	const provider =
		param === 'engine'
			? services.loadEngineKnowledgeGraph
			: param === 'local'
				? services.loadKnowledgeGraph
				: services.loadMergedKnowledgeGraph;
	const graph = await provider.execute(projectId);

	if (url.searchParams.get('view') === 'overview') {
		return json(graphOverview(graph, positiveInt(url.searchParams.get('limit'))));
	}
	// Unknown context/kind values simply match nothing — harmless, no allowlist needed.
	const scope: GraphScope = {
		contexts: csv(url.searchParams.get('contexts')) as GraphContext[] | undefined,
		kinds: csv(url.searchParams.get('kinds')) as GraphNodeKind[] | undefined,
		q: url.searchParams.get('q') ?? undefined,
		focus: url.searchParams.get('focus') ?? undefined,
		depth: positiveInt(url.searchParams.get('depth')),
		limit: positiveInt(url.searchParams.get('limit'))
	};
	const isScoped = Object.values(scope).some((value) => value !== undefined);
	return json(isScoped ? scopeGraph(graph, scope) : graph);
};
