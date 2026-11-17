import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, lonePathBelow, type Family, type Feature } from '.';

const family = (id: string, coreId: string, parentFamilyId: string | null = null): Family => ({
	id,
	name: id,
	coreId,
	parentFamilyId,
	description: ''
});
const feature = (id: string, coreId: string, parentFamilyId: string | null = null): Feature => ({
	id,
	name: id,
	coreId,
	parentFamilyId,
	description: '',
	unspaghettitFeatureId: id
});
const draftOf = (families: Family[], features: Feature[]) => ({
	...createEmptyFeaturesDraft('p'),
	families,
	features
});

describe('lonePathBelow (criterion 4153bde7)', () => {
	it('opens the lone feature of a core', () => {
		const draft = draftOf([], [feature('f1', 'c1')]);
		expect(lonePathBelow(draft, { coreId: 'c1' })).toEqual({ familyIds: [], featureId: 'f1' });
	});

	it('walks down lone families to the lone feature', () => {
		const draft = draftOf(
			[family('a', 'c1'), family('b', 'c1', 'a')],
			[feature('f1', 'c1', 'b')]
		);
		expect(lonePathBelow(draft, { coreId: 'c1' })).toEqual({ familyIds: ['a', 'b'], featureId: 'f1' });
	});

	it('stops at the first level with a real choice', () => {
		const draft = draftOf([family('a', 'c1')], [feature('f1', 'c1', 'a'), feature('f2', 'c1', 'a')]);
		expect(lonePathBelow(draft, { coreId: 'c1' })).toEqual({ familyIds: ['a'], featureId: null });
	});

	it('opens nothing below a grouping holding two things', () => {
		const draft = draftOf([family('a', 'c1')], [feature('f1', 'c1')]);
		expect(lonePathBelow(draft, { coreId: 'c1' })).toEqual({ familyIds: [], featureId: null });
	});

	it('works from a family too', () => {
		const draft = draftOf([family('a', 'c1')], [feature('f1', 'c1', 'a')]);
		expect(lonePathBelow(draft, { familyId: 'a' })).toEqual({ familyIds: [], featureId: 'f1' });
	});
});
