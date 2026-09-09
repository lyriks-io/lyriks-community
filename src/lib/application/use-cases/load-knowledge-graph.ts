import type { KnowledgeGraph } from '$domain/graph';
import type { KnowledgeGraphProviderPort } from '../ports';

/**
 * Build the project's central knowledge graph (the derived read model that
 * unifies every bounded context). Thin orchestrator over the provider port so
 * the graph source is swappable at the composition root.
 */
export class LoadKnowledgeGraphUseCase {
	constructor(private readonly provider: KnowledgeGraphProviderPort) {}

	execute(projectId: string): Promise<KnowledgeGraph> {
		return this.provider.build(projectId);
	}
}
