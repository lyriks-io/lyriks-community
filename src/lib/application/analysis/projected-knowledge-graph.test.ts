import { describe, expect, it } from 'vitest';
import type { CoherenceAnalysis } from '$domain/coherence';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import type { DerivedCapability } from '$domain/users';
import type { GlobalCoherenceCheckerPort, UpstreamCapabilityProviderPort } from '../ports';
import { sectionLoaders } from '../specification/project-sections.fixture';
import { ProjectedKnowledgeGraphProvider } from './projected-knowledge-graph';

const features = createEmptyFeaturesDraft('p1');
features.cores = [createCore({ id: 'c1', name: 'Shop' })];
features.features = [createFeature('c1', null, { id: 'feat-cart', name: 'Cart' })];

const analysis: CoherenceAnalysis = {
	dimensions: [],
	readinessScore: 40,
	gaps: [{ id: 'g-cart', severity: 'high', title: 'Nobody may pay', detail: '', sourceStep: 'users', blocking: true, featureRef: 'feat-cart' }]
};
const dialog: DerivedCapability = { id: 'surface:feat-cart:srf-pay', label: 'Pay dialog', source: 'surface', sourceRefId: 'feat-cart', sourceRefLabel: 'Cart', surfaceKind: 'dialog' };

function provider(checker: GlobalCoherenceCheckerPort, surfaces: () => Promise<DerivedCapability[]>) {
	const s = sectionLoaders({ features }, 'p1');
	const upstream = { listSurfaceCapabilities: surfaces } satisfies Pick<UpstreamCapabilityProviderPort, 'listSurfaceCapabilities'>;
	return new ProjectedKnowledgeGraphProvider(s.loadFoundation, s.loadFeatures, s.loadUsers, s.loadExperience, s.loadData, s.loadRules, s.loadArchitecture, { nowIso: () => 'now' }, checker, upstream);
}

const ids = async (p: ProjectedKnowledgeGraphProvider) => (await p.build('p1')).nodes.map((n) => n.id);

describe('the knowledge graph drawn from the sections', () => {
	it('hangs each coherence gap on the feature it is about, beside the surfaces the access matrix governs', async () => {
		const graph = await provider({ analyze: async () => analysis }, async () => [dialog]).build('p1');
		const flag = graph.edges.find((e) => e.to === 'gap:g-cart');
		expect(flag?.from).toBe('feature:feat-cart');
		expect(graph.nodes.map((n) => n.id)).toContain('surface:srf-pay');
	});

	it('still draws the sections when the coherence check or the surface read fails', async () => {
		const failing = provider({ analyze: async () => Promise.reject(new Error('checker down')) }, async () => Promise.reject(new Error('kernel down')));
		const drawn = await ids(failing);
		expect(drawn).toContain('feature:feat-cart');
		expect(drawn.some((id) => id.startsWith('gap:') || id.startsWith('surface:'))).toBe(false);
	});
});
