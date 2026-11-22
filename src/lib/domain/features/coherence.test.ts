import { describe, expect, it } from 'vitest';
import { computeFeaturesCoherence, createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';

/** A tree of one core and the given leaves (a blank name leaves a leaf unnamed). */
function tree(names: string[]): ProjectFeaturesDraft {
	return {
		...createEmptyFeaturesDraft('p'),
		cores: [{ id: 'core-a', name: 'A', description: '', tone: 'custom' }],
		features: names.map((name, i) => ({ id: `f${i}`, name, coreId: 'core-a', parentFamilyId: null, description: '', unspaghettitFeatureId: `f${i}` }))
	};
}

const codes = (draft: ProjectFeaturesDraft) => computeFeaturesCoherence(draft).issues.map((i) => i.code);

describe('the coherence of a feature tree is its shape', () => {
	it('scores a named tree in full, with no MVP cut and no roadmap to ask for', () => {
		const named = tree(['Import', 'Export']);
		expect(codes(named)).toEqual([]);
		expect(computeFeaturesCoherence(named).score).toBe(100);
	});

	it('scores the tree checks as a share of their 50 points', () => {
		// Core 15 + leaf 15 + half the names 10 = 40 of 50.
		const half = tree(['Import', '']);
		expect(codes(half)).toEqual(['unnamed-feature']);
		expect(computeFeaturesCoherence(half).score).toBe(80);
		expect(computeFeaturesCoherence(createEmptyFeaturesDraft('p')).score).toBe(0);
	});
});
