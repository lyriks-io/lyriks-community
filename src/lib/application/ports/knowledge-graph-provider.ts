import type { KnowledgeGraph } from '$domain/graph';

/**
 * The seam for the central knowledge graph. The local adapter
 * (`ProjectedKnowledgeGraphProvider`) projects the graph from the per-context
 * drafts; a future `EngineKnowledgeGraphProvider` (Lyriks-back → graph engine /
 * KB) implements the SAME port, so swapping the real graph in is a one-line
 * change at the composition root. The viewer + `/api/graph` only see this port.
 */
export interface KnowledgeGraphProviderPort {
	build(projectId: string): Promise<KnowledgeGraph>;
}
