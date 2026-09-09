import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, type Feature, type ProjectFeaturesDraft } from '$domain/features';
import type { FeatureImplementationCoverage } from './load-implementation-coverage';
import {
	planStatusUpgrades,
	ReconcileImplementationStatusesUseCase
} from './reconcile-implementation-statuses';

function leaf(id: string): Feature {
	return { id, name: id, coreId: 'core-1', parentFamilyId: null, description: '', unspaghettitFeatureId: id };
}

function draftWith(statuses: Record<string, 'backlog' | 'in-progress' | 'done'>): ProjectFeaturesDraft {
	const draft = createEmptyFeaturesDraft('p1');
	draft.features.push(leaf('f1'), leaf('f2'), leaf('f3'));
	draft.leafMeta = Object.fromEntries(
		Object.entries(statuses).map(([id, status]) => [id, { status }])
	);
	return draft;
}

function cov(found: number, expected: number): FeatureImplementationCoverage {
	return {
		featureId: 'ignored',
		found,
		expected,
		percent: Math.round((found / expected) * 100),
		updatedAt: '2026-08-17T00:00:00.000Z',
		specUpdatedAt: null
	};
}

describe('planStatusUpgrades', () => {
	it('raises fully-located features to done and started ones to in-progress', () => {
		const changes = planStatusUpgrades(draftWith({}), { f1: cov(4, 4), f2: cov(1, 4) });
		expect(changes).toEqual([
			{ featureId: 'f1', name: 'f1', from: 'backlog', to: 'done', percent: 100 },
			{ featureId: 'f2', name: 'f2', from: 'backlog', to: 'in-progress', percent: 25 }
		]);
	});

	it('requires found >= expected for done: a rounded-up 100% is not full', () => {
		// 199/200 rounds to 100% but is not fully located.
		const changes = planStatusUpgrades(draftWith({}), { f1: cov(199, 200) });
		expect(changes).toEqual([
			{ featureId: 'f1', name: 'f1', from: 'backlog', to: 'in-progress', percent: 100 }
		]);
	});

	it('never downgrades: done stays done, in-progress is not sent back', () => {
		const changes = planStatusUpgrades(draftWith({ f1: 'done', f2: 'in-progress' }), {
			f1: cov(0, 4),
			f2: cov(1, 4)
		});
		expect(changes).toEqual([]);
	});

	it('upgrades in-progress to done when the code catches up', () => {
		const changes = planStatusUpgrades(draftWith({ f1: 'in-progress' }), { f1: cov(4, 4) });
		expect(changes.map((c) => [c.featureId, c.to])).toEqual([['f1', 'done']]);
	});

	it('ignores features without coverage and respects the id scope', () => {
		const coverage = { f1: cov(4, 4), f2: cov(4, 4) };
		expect(planStatusUpgrades(draftWith({}), coverage, ['f2']).map((c) => c.featureId)).toEqual([
			'f2'
		]);
		expect(planStatusUpgrades(draftWith({}), {})).toEqual([]);
	});
});

describe('ReconcileImplementationStatusesUseCase', () => {
	const useCase = (draft: ProjectFeaturesDraft, coverage: Record<string, FeatureImplementationCoverage>) =>
		new ReconcileImplementationStatusesUseCase(
			{ execute: async () => draft } as never,
			{ execute: async () => coverage } as never
		);

	it('applies the upgrades to the returned draft', async () => {
		const draft = draftWith({ f2: 'in-progress' });
		const plan = await useCase(draft, { f1: cov(4, 4), f2: cov(4, 4) }).execute('p1');
		expect(plan.changes).toHaveLength(2);
		expect(plan.draft.leafMeta?.f1?.status).toBe('done');
		expect(plan.draft.leafMeta?.f2?.status).toBe('done');
	});

	it('plans nothing when the engine reports no coverage (fail-soft)', async () => {
		const draft = draftWith({ f1: 'done' });
		const plan = await useCase(draft, {}).execute('p1');
		expect(plan.changes).toEqual([]);
		expect(plan.draft.leafMeta?.f1?.status).toBe('done');
	});
});

describe('planStatusUpgrades and stale evidence', () => {
	/** Coverage that says "everything found", taken BEFORE the spec last moved. */
	const staleCov = (): FeatureImplementationCoverage => ({
		featureId: 'f1',
		found: 4,
		expected: 4,
		percent: 100,
		updatedAt: '2026-08-17T00:00:00.000Z',
		specUpdatedAt: '2026-08-18T00:00:00.000Z'
	});

	it('refuses to promote a feature whose spec moved after the sync', () => {
		const draft = draftWith({ f1: 'backlog' });
		expect(planStatusUpgrades(draft, { f1: staleCov() })).toEqual([]);
	});

	it('promotes again once the sync is newer than the spec', () => {
		const draft = draftWith({ f1: 'backlog' });
		const fresh = { ...staleCov(), updatedAt: '2026-08-19T00:00:00.000Z' };
		expect(planStatusUpgrades(draft, { f1: fresh }).map((c) => c.to)).toEqual(['done']);
	});

	it('still promotes when the spec stamp is unknown (nothing to compare)', () => {
		const draft = draftWith({ f1: 'backlog' });
		const unstamped = { ...staleCov(), specUpdatedAt: null };
		expect(planStatusUpgrades(draft, { f1: unstamped }).map((c) => c.to)).toEqual(['done']);
	});
});
