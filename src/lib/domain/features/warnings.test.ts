import { describe, it, expect } from 'vitest';
import { createEmptyFeaturesDraft, createCore, createFamily, createFeature } from './draft';
import { collectFeaturesWarnings, validateMembership } from './warnings';

function draftWith(over: Partial<ReturnType<typeof createEmptyFeaturesDraft>>) {
	return { ...createEmptyFeaturesDraft('p1'), ...over };
}

describe('collectFeaturesWarnings', () => {
	it('is silent on a well-formed tree', () => {
		const core = createCore({ id: 'c1', name: 'Core' });
		const family = createFamily('c1', null, { id: 'f1', name: 'Fam' });
		const feature = createFeature('c1', 'f1', { id: 'x1', name: 'Feat' });
		const warnings = collectFeaturesWarnings(
			draftWith({ cores: [core], families: [family], features: [feature] })
		);
		expect(warnings).toEqual([]);
	});

	it('does not warn on unassigned (empty/null) tree links', () => {
		const feature = createFeature('', null, { id: 'x1', name: 'Orphan-but-ok' });
		expect(collectFeaturesWarnings(draftWith({ features: [feature] }))).toEqual([]);
	});

	it('flags a dangling coreId', () => {
		const feature = createFeature('ghost-core', null, { id: 'x1', name: 'Feat' });
		const warnings = collectFeaturesWarnings(draftWith({ features: [feature] }));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({ code: 'dangling-core-ref', ref: 'x1' });
	});

	it('flags a dangling parentFamilyId', () => {
		const core = createCore({ id: 'c1' });
		const feature = createFeature('c1', 'ghost-family', { id: 'x1', name: 'Feat' });
		const warnings = collectFeaturesWarnings(
			draftWith({ cores: [core], features: [feature] })
		);
		expect(warnings.map((w) => w.code)).toEqual(['dangling-family-ref']);
	});

	it('flags a feature under a family from a different Core', () => {
		const coreA = createCore({ id: 'cA', name: 'A' });
		const coreB = createCore({ id: 'cB', name: 'B' });
		const familyB = createFamily('cB', null, { id: 'fB', name: 'FamB' });
		// Feature claims Core A but is nested under a family that belongs to Core B.
		const feature = createFeature('cA', 'fB', { id: 'x1', name: 'Feat' });
		const warnings = collectFeaturesWarnings(
			draftWith({ cores: [coreA, coreB], families: [familyB], features: [feature] })
		);
		expect(warnings.map((w) => w.code)).toEqual(['family-core-mismatch']);
	});

	it('flags an MVP assignment to a missing feature', () => {
		const warnings = collectFeaturesWarnings(
			draftWith({ mvpAssignments: [{ featureId: 'gone', tier: 'must' }] })
		);
		expect(warnings.map((w) => w.code)).toEqual(['orphaned-mvp-assignment']);
	});

	it('flags a roadmap assignment to a missing release', () => {
		const feature = createFeature('', null, { id: 'x1' });
		const warnings = collectFeaturesWarnings(
			draftWith({
				features: [feature],
				roadmapAssignments: [{ featureId: 'x1', releaseId: 'gone' }]
			})
		);
		expect(warnings.map((w) => w.code)).toEqual(['orphaned-roadmap-assignment']);
		expect(warnings[0].ref).toBe('gone');
	});
});

describe('validateMembership', () => {
	const cores = [createCore({ id: 'cA', name: 'A' }), createCore({ id: 'cB', name: 'B' })];
	const families = [createFamily('cA', null, { id: 'fA', name: 'FamA' })];

	it('accepts an existing core with a null family (directly under the core)', () => {
		expect(validateMembership({ coreId: 'cA', parentFamilyId: null }, { cores, families })).toEqual({ ok: true });
	});

	it('accepts a family that belongs to the same core', () => {
		expect(validateMembership({ coreId: 'cA', parentFamilyId: 'fA' }, { cores, families })).toEqual({ ok: true });
	});

	it('treats an empty coreId as unassigned (valid)', () => {
		expect(validateMembership({ coreId: '', parentFamilyId: null }, { cores, families })).toEqual({ ok: true });
	});

	it('rejects a non-existent core', () => {
		expect(validateMembership({ coreId: 'ghost', parentFamilyId: null }, { cores, families }).ok).toBe(false);
	});

	it('rejects a non-existent family', () => {
		expect(validateMembership({ coreId: 'cA', parentFamilyId: 'ghost' }, { cores, families }).ok).toBe(false);
	});

	it('rejects a family from a different core', () => {
		const res = validateMembership({ coreId: 'cB', parentFamilyId: 'fA' }, { cores, families });
		expect(res.ok).toBe(false);
	});
});
