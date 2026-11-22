import { describe, expect, it } from 'vitest';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { createEdgeCase, createEmptyRulesDraft } from '$domain/rules';
import { localCoherenceChecker } from './local-global-coherence-checker.fixture';

describe('LocalGlobalCoherenceChecker feature evidence', () => {
	it('keeps Features and maturity visible at zero when no leaf exists', async () => {
		const analysis = await localCoherenceChecker({}, 'project-1').checker.analyze('project-1');

		expect(analysis.dimensions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'features', score: 0 }),
				expect.objectContaining({ key: 'maturity', score: 0 })
			])
		);
		expect(analysis.gaps).toContainEqual(
			expect.objectContaining({
				id: 'gap-features-missing-leaf',
				kind: 'missing',
				blocking: true
			})
		);
		expect(analysis.readinessScore).toBeLessThan(50);
	});

	it('blocks a leaf whose canonical kernel record is missing', async () => {
		const features = createEmptyFeaturesDraft('project-1');
		features.cores = [createCore({ id: 'core-multiplayer', name: 'Multiplayer' })];
		features.features = [
			createFeature('core-multiplayer', null, {
				id: 'feat-private-match',
				name: 'Private match'
			})
		];
		const { checker, shellReads } = localCoherenceChecker({ features }, 'project-1');
		const analysis = await checker.analyze('project-1');

		expect(shellReads).toEqual(['feat-private-match']);
		expect(analysis.featureMaturity).toEqual({ 'feat-private-match': 0 });
		expect(analysis.gaps).toContainEqual(
			expect.objectContaining({
				id: 'gap-features-missing-kernel-snapshots',
				kind: 'dangling',
				blocking: true
			})
		);
	});
});

describe('LocalGlobalCoherenceChecker, acceptance criteria testing no feature', () => {
	function project() {
		const features = createEmptyFeaturesDraft('project-1');
		features.cores = [createCore({ id: 'core-orders', name: 'Orders' })];
		features.features = [createFeature('core-orders', null, { id: 'feat-refund', name: 'Refund an order' })];
		const rules = createEmptyRulesDraft('project-1');
		rules.scenarios = [
			createEdgeCase({ id: 'c-attached', title: 'A refund needs a reason', relatedFeatureId: 'feat-refund' }),
			createEdgeCase({ id: 'c-none', title: 'Totals always add up', relatedFeatureId: null }),
			createEdgeCase({ id: 'c-deleted', title: 'An old export runs nightly', relatedFeatureId: 'feat-gone' })
		];
		return localCoherenceChecker({ features, rules }, 'project-1').checker;
	}

	it('flags each criterion naming no feature or a deleted one, with a link to attach it', async () => {
		const analysis = await project().analyze('project-1');
		const flagged = analysis.gaps.filter((g) => g.checkId === 'rules.criteria-attached');

		expect(flagged.map((g) => g.id).sort()).toEqual([
			'gap-rules-criterion-unattached-c-deleted',
			'gap-rules-criterion-unattached-c-none'
		]);
		expect(flagged.find((g) => g.id.endsWith('c-none'))).toMatchObject({
			kind: 'orphan',
			blocking: false,
			sourceStep: 'features',
			fixAnchor: '?case=c-none',
			title: '"Totals always add up" tests no feature'
		});
		expect(analysis.checksRun).toContain('rules.criteria-attached');
	});
});
