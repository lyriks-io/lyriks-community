import { describe, it, expect } from 'vitest';
import { summarizeBehavior } from './summarize-behavior';
import type { FeatureMaturityScorerPort } from './ports';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

const scorer: FeatureMaturityScorerPort = { score: () => 0, report: () => null };

function snapshotWith(acceptanceCriteria: unknown[]): UnspaFeatureSnapshot {
	return {
		format: 'unspaghettit',
		version: 1,
		feature: { id: 'f1', name: 'Invoice', surfaces: [], acceptanceCriteria }
	} as unknown as UnspaFeatureSnapshot;
}

const criteriaOf = (acceptanceCriteria: unknown[]) =>
	summarizeBehavior(null, [{ featureId: 'f1', snapshot: snapshotWith(acceptanceCriteria) }], scorer)
		.features[0].acceptanceCriteria;

describe('acceptance criteria read as one list', () => {
	it('carries both origins, and only the projected one points back at the panel', () => {
		const criteria = criteriaOf([
			{ id: 'ac-leaf-x1', title: 'Paid invoices leave the dunning run' },
			{ id: '7f4b930b', title: 'A batch refuses to overwrite what changed', status: 'draft' }
		]);
		expect(criteria.map((c) => c.wizardId)).toEqual(['x1', undefined]);
		expect(criteria[1].status).toBe('draft');
	});

	it('derives what supersedes what from the relations the others declare', () => {
		const criteria = criteriaOf([
			{ id: 'old', title: 'Footsteps are silent in water' },
			{ id: 'new', title: 'Shallow water has footsteps', relations: [{ kind: 'supersedes', criterionId: 'old' }] }
		]);
		expect(criteria.find((c) => c.id === 'old')?.supersededBy).toEqual(['new']);
		expect(criteria.find((c) => c.id === 'new')?.supersededBy).toEqual([]);
	});

	it('ignores a relation that points into another feature, which it cannot resolve', () => {
		const criteria = criteriaOf([
			{ id: 'here', title: 'Local' },
			{ id: 'other', title: 'Elsewhere', relations: [{ kind: 'supersedes', criterionId: 'here', featureId: 'feat-b' }] }
		]);
		expect(criteria.find((c) => c.id === 'here')?.supersededBy).toEqual([]);
	});

	it('never invents a status, and keeps a long criterion whole', () => {
		const [criterion] = criteriaOf([
			{ id: 'ac-leaf-x1', title: 'An opening clause', description: 'An opening clause and the rest of it.' }
		]);
		expect(criterion.status).toBeUndefined();
		expect(criterion.description).toBe('An opening clause and the rest of it.');
	});

	it('reads an absent list as no criteria rather than failing', () => {
		expect(criteriaOf([])).toEqual([]);
	});
});
