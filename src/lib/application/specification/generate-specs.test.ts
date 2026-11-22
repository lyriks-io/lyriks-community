import { describe, expect, it } from 'vitest';
import { createEmptyCoherenceDraft, type CoherenceAnalysis, type Gap, type ProjectCoherenceDraft } from '$domain/coherence';
import { createEmptyIdentityDraft } from '$domain/foundation';
import type { CoherenceDraftRepositoryPort, FeatureAcceptanceReaderPort, GlobalCoherenceCheckerPort, TelemetryEvent } from '../ports';
import { GenerateSpecsUseCase } from './generate-specs';
import { sectionLoaders } from './project-sections.fixture';

const NOW = '2026-11-18T09:00:00.000Z';
const blocking: Gap = { id: 'g-block', severity: 'high', title: 'No role', detail: '', sourceStep: 'users', blocking: true };

/** The Coherence section of project p1, its next save answering `revision` (null: changed elsewhere). */
class CoherenceStore implements CoherenceDraftRepositoryPort {
	saved: ProjectCoherenceDraft | null = null;
	constructor(private readonly revision: number | null = 4) {}
	async load() {
		return { ...createEmptyCoherenceDraft('p1'), threshold: 80 };
	}
	async save(draft: ProjectCoherenceDraft) {
		if (this.revision === null) return null;
		this.saved = draft;
		return this.revision;
	}
	async currentRevision() {
		return 3;
	}
}

function generate(analysis: CoherenceAnalysis, store = new CoherenceStore()) {
	const events: TelemetryEvent[] = [];
	const checker = { analyze: async () => analysis } satisfies GlobalCoherenceCheckerPort;
	const acceptance = { byFeature: async () => ({}) } satisfies FeatureAcceptanceReaderPort;
	const s = sectionLoaders({ identity: { ...createEmptyIdentityDraft('p1'), productName: 'Ledger' } }, 'p1');
	const useCase = new GenerateSpecsUseCase(
		store,
		checker,
		{ nowIso: () => NOW },
		{ emit: (event) => void events.push(event) },
		s.loadFoundation,
		s.loadUsers,
		s.loadFeatures,
		s.loadExperience,
		s.loadRules,
		s.loadData,
		s.loadArchitecture,
		s.loadDocuments,
		acceptance,
		{ get: async () => { throw new Error('index unreadable'); } }
	);
	return { run: () => useCase.execute('p1', { expectedRevision: 3, origin: null }), store, events };
}

const green: CoherenceAnalysis = { dimensions: [], gaps: [], readinessScore: 85 };

describe('generating the specs', () => {
	it('writes the four documents into the Coherence section, stamped, on a green spec', async () => {
		const { run, store } = generate(green);
		const result = await run();
		expect(result).toMatchObject({ ok: true, revision: 4 });
		expect(store.saved).toMatchObject({ specsGenerated: true, generatedAt: NOW, lastSavedAt: NOW });
		expect(store.saved?.artifacts.map((a) => a.kind)).toEqual(['functional_doc', 'technical_doc', 'requirements_doc', 'coherence_graph']);
		expect(store.saved?.artifacts.find((a) => a.kind === 'requirements_doc')?.content).toContain('Ledger');
	});

	it('refuses below the threshold or with a blocking gap, and writes nothing', async () => {
		for (const analysis of [{ ...green, readinessScore: 79 }, { ...green, gaps: [blocking] }]) {
			const { run, store, events } = generate(analysis);
			expect(await run()).toEqual({ ok: false, reason: 'Spec is not green: resolve blocking gaps and reach the threshold.' });
			expect(store.saved).toBeNull();
			expect(events).toEqual([]);
		}
	});

	it('reports a conflict when the section changed since it was read, and says nothing was generated', async () => {
		const { run, events } = generate(green, new CoherenceStore(null));
		expect(await run()).toEqual({ ok: false, reason: 'conflict' });
		expect(events).toEqual([]);
	});
});
