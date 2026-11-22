import { describe, expect, it } from 'vitest';
import { GraphBuilder, nodeId, type KnowledgeGraph } from '$domain/graph';
import { UNSPA_FEATURE_FORMAT, UNSPA_PROJECT_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot, type UnspaProjectSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort, FormalCoherenceReport, FormalVerdictPort, KnowledgeGraphProviderPort } from '../ports';
import { MergedKnowledgeGraphProvider } from './merged-knowledge-graph';

const NOW = '2026-11-18T09:00:00.000Z';

/** The wizard projection of project p1: the project and its one feature. */
const local = {
	build: async (projectId: string): Promise<KnowledgeGraph> => {
		const g = new GraphBuilder();
		g.addNode({ id: nodeId('project', projectId), kind: 'project', context: 'project', label: 'Shop' });
		g.addNode({ id: nodeId('feature', 'feat-cart'), kind: 'feature', context: 'features', label: 'Cart' });
		g.addEdge({ id: 'e1', from: nodeId('project', projectId), to: nodeId('feature', 'feat-cart'), kind: 'contains' });
		return g.build(projectId, NOW);
	}
} satisfies KnowledgeGraphProviderPort;

/** The behavior model of p1: feature feat-cart with one screen and one action. */
class BehaviorModel implements Pick<BehaviorRepositoryPort, 'loadProject' | 'loadFeature'> {
	constructor(private readonly down = false) {}
	async loadProject(projectId: string): Promise<UnspaProjectSnapshot | null> {
		if (this.down) throw new Error('kernel unreadable');
		return { format: UNSPA_PROJECT_FORMAT, version: UNSPA_VERSION, project: { id: projectId, name: 'Shop', description: '', tags: [], featureIds: ['feat-cart'], createdAt: NOW, updatedAt: NOW } };
	}
	async loadFeature(): Promise<UnspaFeatureSnapshot | null> {
		return {
			format: UNSPA_FEATURE_FORMAT,
			version: UNSPA_VERSION,
			feature: { id: 'feat-cart', name: 'Cart', surfaces: [{ id: 'srf-cart', name: 'Cart page', actions: [{ id: 'act-pay', name: 'Pay' }] }] }
		};
	}
}

/** The formal engine's verdict, counting how often it was asked. */
class Formal implements FormalVerdictPort {
	asked = 0;
	constructor(private readonly report: FormalCoherenceReport | Error) {}
	async fetchFormalCoherence() {
		this.asked += 1;
		if (this.report instanceof Error) throw this.report;
		return this.report;
	}
}
const violated: FormalCoherenceReport = { engineAvailable: true, coherent: false, inconsistencies: [{ code: 'TYPE_COMPAT', message: 'x', nodeIds: [] }] };

function build(behavior: BehaviorModel, formal: Formal, formalEnabled = true) {
	const errors: unknown[] = [];
	const provider = new MergedKnowledgeGraphProvider(local, behavior, formal, { nowIso: () => NOW }, (e) => errors.push(e), formalEnabled);
	return { graph: () => provider.build('p1'), errors };
}

const labels = (graph: KnowledgeGraph) => graph.nodes.map((n) => n.label);

describe('the knowledge graph a person opens', () => {
	it('lays the behavior model and the formal verdict over the wizard projection, one node per concept', async () => {
		const graph = await build(new BehaviorModel(), new Formal(violated)).graph();
		expect(labels(graph)).toEqual(expect.arrayContaining(['Shop', 'Cart', 'Cart page', 'Pay', 'Formal (DPO): 1 violation(s)']));
		expect(graph.nodes.filter((n) => n.label === 'Cart')).toHaveLength(1);
	});

	it('still opens on the wizard projection when the behavior model or the formal engine cannot be read, saying why', async () => {
		const { graph, errors } = build(new BehaviorModel(true), new Formal(new Error('engine down')));
		expect(labels(await graph())).toEqual(['Shop', 'Cart']);
		expect(errors.map((e) => (e as Error).message)).toEqual(['kernel unreadable', 'engine down']);
	});

	it('never asks the formal engine on an edition without it', async () => {
		const formal = new Formal(violated);
		const graph = await build(new BehaviorModel(), formal, false).graph();
		expect(formal.asked).toBe(0);
		expect(labels(graph).some((l) => l.startsWith('Formal (DPO)'))).toBe(false);
	});
});
