import { GraphBuilder, nodeId, type KnowledgeGraph } from '$domain/graph';
import {
	buildBehaviorGraphElements,
	buildDpoOverlayElements
} from './build-behavior-knowledge-graph';
import { collapseKernelTwins } from './collapse-kernel-twins';
import type {
	BehaviorRepositoryPort,
	ClockPort,
	FormalVerdictPort,
	KnowledgeGraphProviderPort
} from './ports';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/**
 * The DEFAULT knowledge-graph provider: the local wizard projection, overlaid
 * with the Unspaghettit behavior model (readable feature → surface → action →
 * event, from the human names in the snapshots) AND the formal DPO verdict.
 *
 * This is what "combine DPO + unspa" means in practice. The raw DPO/MRS
 * substrate stays behind `?source=engine` for power users; here the DPO shows up
 * as an understandable verdict overlay, and unspa as named behavior nodes — the
 * two data sources complete each other (unspa gives the names, DPO gives the
 * proof) instead of a hairball of engine internals.
 *
 * Both overlays are best-effort. DPO is additionally policy-gated to Enterprise;
 * Community receives the local + behavior graph and never calls the formal API.
 */
export class MergedKnowledgeGraphProvider implements KnowledgeGraphProviderPort {
	constructor(
		private readonly local: KnowledgeGraphProviderPort,
		private readonly behavior: BehaviorRepositoryPort,
		private readonly formalVerdict: FormalVerdictPort,
		private readonly clock: ClockPort,
		private readonly onError?: (err: unknown) => void,
		private readonly formalEnabled = true
	) {}

	async build(projectId: string): Promise<KnowledgeGraph> {
		const base = await this.local.build(projectId);
		const g = new GraphBuilder();
		for (const n of base.nodes) g.addNode(n);
		for (const e of base.edges) g.addEdge(e);

		const projectRootId = nodeId('project', projectId);

		// ── Behavior overlay (unspa) ──────────────────────────────────────────
		try {
			const project = await this.behavior.loadProject(projectId);
			if (project) {
				const features = (
					await Promise.all(
						project.project.featureIds.map((fid) => this.behavior.loadFeature(projectId, fid))
					)
				).filter((f): f is UnspaFeatureSnapshot => f != null);
				const { nodes, edges } = buildBehaviorGraphElements(projectRootId, features);
				for (const n of nodes) g.addNode(n);
				for (const e of edges) g.addEdge(e);
			}
		} catch (err) {
			this.onError?.(err);
		}

		// ── Formal DPO verdict overlay ────────────────────────────────────────
		// Cheap cached read (GET) — never the heavy forced sync; the graph must
		// stay fast to open.
		if (this.formalEnabled) {
			try {
				const report = await this.formalVerdict.fetchFormalCoherence(projectId);
				const { nodes, edges } = buildDpoOverlayElements(projectRootId, report);
				for (const n of nodes) g.addNode(n);
				for (const e of edges) g.addEdge(e);
			} catch (err) {
				this.onError?.(err);
			}
		}

		// One node per concept: fold the kernel's twin projections (features,
		// surfaces, actions, personas, resources, entity mirrors) into their
		// wizard nodes before anyone reads the graph.
		return collapseKernelTwins(g.build(projectId, this.clock.nowIso()));
	}
}
