import { describe, it, expect } from 'vitest';
import { createEmptyFeaturesDraft, createCore, createFamily, createFeature } from './draft';
import { collectFeaturesWarnings } from './warnings';

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

	it('names a nameless feature by its id in the warning', () => {
		const [warning] = collectFeaturesWarnings(draftWith({ features: [createFeature('ghost-core', null, { id: 'x1', name: '  ' })] }));
		expect(warning.message).toContain('#x1');
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
});

describe('feature tree warnings in French (spec language)', () => {
	const NB = ' ';
	it('writes the warnings in French with codes unchanged and names quoted as they are', () => {
		const feature = createFeature('ghost-core', null, { id: 'x1', name: 'Feat' });
		const [warning] = collectFeaturesWarnings(draftWith({ features: [feature] }), 'fr');
		expect(warning).toMatchObject({ code: 'dangling-core-ref', ref: 'x1' });
		expect(warning.message).toBe(
			`«${NB}Feat${NB}» fait référence au domaine «${NB}ghost-core${NB}», qui n'existe plus.`
		);
	});

	it('keeps English byte-identical when no language is given', () => {
		const feature = createFeature('ghost-core', null, { id: 'x1', name: 'Feat' });
		expect(collectFeaturesWarnings(draftWith({ features: [feature] }))[0].message).toBe(
			'"Feat" references Core "ghost-core", which no longer exists.'
		);
	});
});
