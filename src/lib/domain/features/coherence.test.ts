import { describe, expect, it } from 'vitest';
import { computeFeaturesCoherence, createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';

/** A tree of one core and the given leaves, each with the status given (none: no leafMeta). */
function tree(leaves: Array<[id: string, status?: 'backlog' | 'in-progress' | 'done']>): ProjectFeaturesDraft {
	const draft = createEmptyFeaturesDraft('p');
	return {
		...draft,
		cores: [{ id: 'core-a', name: 'A', description: '', tone: 'custom' }],
		features: leaves.map(([id]) => ({ id, name: id, coreId: 'core-a', parentFamilyId: null, description: '', unspaghettitFeatureId: id })),
		leafMeta: Object.fromEntries(leaves.filter(([, status]) => status).map(([id, status]) => [id, { status }]))
	} as ProjectFeaturesDraft;
}

const codes = (draft: ProjectFeaturesDraft) => computeFeaturesCoherence(draft).issues.map((i) => i.code);

// Criterion d012efb8 of feat-feature-tree (lyriks-feb747).
describe('the coherence of a feature tree with delivered features', () => {
	it('asks no priority and no release of features already delivered', () => {
		const delivered = tree([['f1', 'done'], ['f2', 'done']]);
		expect(codes(delivered)).toEqual([]);
		expect(computeFeaturesCoherence(delivered).score).toBe(100);
	});

	it('still asks both of the features left to build', () => {
		const mixed = tree([['f1', 'done'], ['f2', 'backlog'], ['f3']]);
		expect(codes(mixed)).toContain('untiered-features');
		expect(computeFeaturesCoherence(mixed).issues.find((i) => i.code === 'untiered-features')?.message).toBe('2 Feature(s) without a priority.');
		const planned = { ...mixed, mvpAssignments: [{ featureId: 'f2', tier: 'must' as const }, { featureId: 'f3', tier: 'should' as const }] };
		expect(computeFeaturesCoherence(planned).issues.find((i) => i.code === 'must-without-release')?.message).toBe('1 Must-tier Feature(s) not placed in a release.');
	});

	it('does not count a delivered Must against the roadmap', () => {
		const shipped = { ...tree([['f1', 'done'], ['f2', 'backlog']]), mvpAssignments: [{ featureId: 'f1', tier: 'must' as const }, { featureId: 'f2', tier: 'should' as const }] };
		expect(codes(shipped)).not.toContain('must-without-release');
	});
});
