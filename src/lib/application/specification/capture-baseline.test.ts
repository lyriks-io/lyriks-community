import { describe, expect, it } from 'vitest';
import { createEmptyBaselinesDraft, type Baseline, type ProjectBaselinesDraft } from '$domain/baselines';
import type { CoherenceAnalysis, Gap } from '$domain/coherence';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { createEmptyIdentityDraft } from '$domain/foundation';
import type { FeatureAcceptanceReaderPort, GlobalCoherenceCheckerPort, SectionDraftRepositoryPort } from '../ports';
import { CaptureBaselineUseCase } from './capture-baseline';
import { sectionLoaders } from './project-sections.fixture';

const NOW = '2026-11-18T09:00:00.000Z';
const gap: Gap = { id: 'g1', severity: 'high', title: 'No role', detail: '', sourceStep: 'users', blocking: true };
/** A red spec: far below any threshold, with a blocking gap. */
const red: CoherenceAnalysis = { dimensions: [], gaps: [gap], readinessScore: 12 };

const earlier: Baseline = { id: 'b0', name: 'Discovery', note: '', createdAt: '2026-10-01T00:00:00.000Z', readiness: 5, coherence: 50, featureCount: 0, content: '# old' };

/** The Baselines section of project p1, its next save answering `revision` (null: changed elsewhere). */
class BaselineStore implements SectionDraftRepositoryPort<ProjectBaselinesDraft> {
	saved: ProjectBaselinesDraft | null = null;
	constructor(private readonly revision: number | null = 2) {}
	async load() {
		return { ...createEmptyBaselinesDraft('p1'), baselines: [earlier] };
	}
	async save(draft: ProjectBaselinesDraft) {
		if (this.revision === null) return null;
		this.saved = draft;
		return this.revision;
	}
	async currentRevision() {
		return 1;
	}
}

function capture(store = new BaselineStore()) {
	const features = createEmptyFeaturesDraft('p1');
	features.cores = [createCore({ id: 'c1', name: 'Ledger' })];
	features.features = [createFeature('c1', null, { id: 'f1', name: 'Close the month' }), createFeature('c1', null, { id: 'f2', name: 'Export' })];
	const s = sectionLoaders({ identity: { ...createEmptyIdentityDraft('p1'), productName: 'Ledger' }, features }, 'p1');
	const checker = { analyze: async () => red } satisfies GlobalCoherenceCheckerPort;
	const acceptance = { byFeature: async () => ({}) } satisfies FeatureAcceptanceReaderPort;
	const useCase = new CaptureBaselineUseCase(
		store,
		checker,
		{ nowIso: () => NOW },
		s.loadFoundation,
		s.loadUsers,
		s.loadFeatures,
		s.loadExperience,
		s.loadRules,
		s.loadData,
		s.loadArchitecture,
		s.loadDocuments,
		acceptance,
		// The code holds all of f1 and part of f2: the document reads it as their status.
		{ get: async () => ({ f1: { found: 3, expected: 3 }, f2: { found: 1, expected: 4 } }) }
	);
	return { run: (name: string, note: string) => useCase.execute('p1', name, note, { expectedRevision: 1, origin: null }), store };
}

describe('capturing a baseline of the specification', () => {
	it('captures even a red spec, newest first, with its scores, its feature count and the requirements document', async () => {
		const { run, store } = capture();
		const result = await run('  Launch  ', '  frozen for the audit ');
		expect(result?.revision).toBe(2);
		const [baseline, ...rest] = store.saved?.baselines ?? [];
		expect(rest).toEqual([earlier]);
		expect(baseline).toMatchObject({
			name: 'Launch',
			note: 'frozen for the audit',
			createdAt: NOW,
			readiness: 12,
			coherence: coherenceScoreOf([gap]),
			featureCount: 2
		});
		expect(baseline.content).toContain('Close the month');
		expect(baseline.content).toContain('#### Close the month\n_Status: done_');
		expect(baseline.content).toContain('#### Export\n_Status: in progress_');
		expect(store.saved?.lastSavedAt).toBe(NOW);
	});

	it('names a baseline left unnamed after its day', async () => {
		const { run, store } = capture();
		await run('   ', '');
		expect(store.saved?.baselines[0].name).toBe('Baseline 2026-11-18');
	});

	it('answers nothing when the section changed since it was read', async () => {
		expect(await capture(new BaselineStore(null)).run('Launch', '')).toBeNull();
	});
});
