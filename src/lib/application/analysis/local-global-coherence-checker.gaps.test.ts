import { describe, expect, it } from 'vitest';
import { createEmptyArchitectureDraft, createTechChoice } from '$domain/architecture';
import { createEmptyDataDraft, createEntity, createField, type ProjectDataDraft } from '$domain/data';
import { createDataRead, createEmptyExperienceDraft, createJourney, createStep } from '$domain/experience';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { createEmptyGlossaryDraft, createTerm } from '$domain/glossary';
import { createEmptyUsersDraft, createRole } from '$domain/users';
import { localCoherenceChecker, type CoherenceProject } from './local-global-coherence-checker.fixture';

const gapIds = async (project: CoherenceProject) => (await localCoherenceChecker(project).checker.analyze('p')).gaps.map((g) => g.id);

/** Two cores, one feature each. */
function twoCores() {
	const features = createEmptyFeaturesDraft('p');
	features.cores = [createCore({ id: 'c-order', name: 'Ordering' }), createCore({ id: 'c-pay', name: 'Paying' })];
	features.features = [createFeature('c-order', null, { id: 'f-cart', name: 'Cart' }), createFeature('c-pay', null, { id: 'f-pay', name: 'Pay' })];
	return features;
}

const users = (permissions: { roleId: string }[] = []) => ({
	...createEmptyUsersDraft('p'),
	roles: [createRole({ id: 'r-buyer', name: 'Buyer' })],
	permissions: permissions.map((p) => ({ ...p, capabilityId: 'feature:f-cart', capabilitySource: 'feature' as const }))
});

describe('the gaps the local checker reads across sections', () => {
	it('flags a journey actor, a grant and a relation that point at what no longer exists', async () => {
		const experience = { ...createEmptyExperienceDraft('p'), journeys: [createJourney('c-order', 0, { id: 'j1', actorRoleIds: ['r-buyer', 'r-gone'] })] };
		const data: ProjectDataDraft = {
			...createEmptyDataDraft('p'),
			entities: [createEntity({ id: 'e-order', name: 'Order', databaseId: 'db' })],
			fields: [createField('e-order', { id: 'fd-customer', name: 'Customer', type: 'relation', relationTargetEntityId: 'e-deleted' })]
		};
		const broken = await gapIds({ users: users([{ roleId: 'r-buyer' }, { roleId: 'r-gone' }]), experience, data });
		expect(broken).toEqual(expect.arrayContaining(['gap-experience-dangling-role', 'gap-permissions-dangling-role', 'gap-data-dangling-relations']));

		const sound = await gapIds({
			users: users([{ roleId: 'r-buyer' }]),
			experience: { ...experience, journeys: [createJourney('c-order', 0, { id: 'j1', actorRoleIds: ['r-buyer'] })] },
			data: { ...data, fields: [createField('e-order', { id: 'fd-total', name: 'Total' })] }
		});
		expect(sound.filter((id) => id.endsWith('-dangling-role') || id === 'gap-data-dangling-relations')).toEqual([]);
	});

	it('flags a field a step reads that its table does not model, whatever its case, but leaves an unmodeled table to its own check', async () => {
		const data: ProjectDataDraft = {
			...createEmptyDataDraft('p'),
			entities: [createEntity({ id: 'e-order', name: 'Order', databaseId: 'db' })],
			fields: [createField('e-order', { id: 'fd-total', name: 'Total' })]
		};
		const reading = (entityName: string, fields: string[]) => ({
			...createEmptyExperienceDraft('p'),
			steps: [createStep('j1', 0, { id: 's1' })],
			stepDataReads: [createDataRead('s1', 0, { entityName, fields })]
		});
		expect(await gapIds({ data, experience: reading(' order ', ['TOTAL']) })).not.toContain('gap-data-orphan-fields');
		expect(await gapIds({ data, experience: reading('Order', ['Discount']) })).toContain('gap-data-orphan-fields');
		expect(await gapIds({ data, experience: reading('Invoice', ['Number']) })).not.toContain('gap-data-orphan-fields');
	});

	it('flags two tables sharing a name whatever case and spacing, and a table placed on no database', async () => {
		const data = (names: string[], databaseId: string | null) => ({ ...createEmptyDataDraft('p'), entities: names.map((name, i) => createEntity({ id: `e${i}`, name, databaseId })) });
		expect(await gapIds({ data: data(['Order', ' order '], 'db') })).toContain('gap-data-duplicate-entities');
		expect(await gapIds({ data: data(['Order', 'Invoice'], 'db') })).not.toContain('gap-data-duplicate-entities');
		expect(await gapIds({ data: data(['Order'], null) })).toContain('gap-data-orphan-entities');
		expect(await gapIds({ data: data(['Order'], 'db') })).not.toContain('gap-data-orphan-entities');
	});

	it('flags roles that are granted nothing at all', async () => {
		expect(await gapIds({ users: users() })).toContain('gap-users-orphan-roles');
		expect(await gapIds({ users: users([{ roleId: 'r-buyer' }]) })).not.toContain('gap-users-orphan-roles');
	});

	it('flags features no journey walks through: no journey at all, then a core no journey covers', async () => {
		expect(await gapIds({})).not.toContain('gap-experience-empty');
		const features = twoCores();
		const none = await gapIds({ features });
		expect(none).toContain('gap-experience-empty');
		expect(none).not.toContain('gap-features-orphan-core');

		const half = await gapIds({ features, experience: { ...createEmptyExperienceDraft('p'), journeys: [createJourney('c-order', 0)] } });
		expect(half).toContain('gap-features-orphan-core');
		expect(half).not.toContain('gap-experience-empty');

		const both = await gapIds({ features, experience: { ...createEmptyExperienceDraft('p'), journeys: [createJourney('c-order', 0), createJourney('c-pay', 1)] } });
		expect(both).not.toContain('gap-features-orphan-core');
	});

	it('flags named glossary terms left undefined or unapproved, never an empty glossary or an unnamed row', async () => {
		const glossary = (...terms: ReturnType<typeof createTerm>[]) => ({ ...createEmptyGlossaryDraft('p'), terms });
		expect(await gapIds({ glossary: glossary(createTerm({ term: 'Order' })) })).toEqual(
			expect.arrayContaining(['gap-glossary-undefined-terms', 'gap-glossary-unapproved-terms'])
		);
		const settled = await gapIds({ glossary: glossary(createTerm({ term: 'Order', definition: 'A purchase.', status: 'approved' }), createTerm({ term: '  ' })) });
		expect(settled.filter((id) => id.startsWith('gap-glossary-'))).toEqual([]);
		expect((await gapIds({})).filter((id) => id.startsWith('gap-glossary-'))).toEqual([]);
	});

	it('asks for the reference of a tech choice only once the architecture is at implementation', async () => {
		const architecture = (stage: 'logical' | 'implementation') => ({ ...createEmptyArchitectureDraft('p'), stage, techChoices: [createTechChoice('backend', { name: 'Postgres' })] });
		expect(await gapIds({ architecture: architecture('implementation') })).toContain('gap-architecture-refs');
		expect(await gapIds({ architecture: architecture('logical') })).not.toContain('gap-architecture-refs');
	});
});

describe('the behavior maturity the local checker reads', () => {
	it('averages the leaves, rounded, keeps each leaf apart, and flags below half', async () => {
		const features = twoCores();
		const shells = { 'f-cart': { id: 'f-cart' }, 'f-pay': { id: 'f-pay' } };
		const scored = (cart: number, pay: number) => localCoherenceChecker({ features, shells, score: (s) => (s?.feature.id === 'f-cart' ? cart : pay) }).checker.analyze('p');

		const low = await scored(60, 37);
		expect(low.featureMaturity).toEqual({ 'f-cart': 60, 'f-pay': 37 });
		expect(low.dimensions.find((d) => d.key === 'maturity')?.score).toBe(49);
		expect(low.gaps.map((g) => g.id)).toContain('gap-features-immature');

		const half = await scored(60, 40);
		expect(half.dimensions.find((d) => d.key === 'maturity')?.score).toBe(50);
		expect(half.gaps.map((g) => g.id)).not.toContain('gap-features-immature');
	});
});

describe('the last activity the local checker reads', () => {
	it('is the freshest save across every section, and none before anything was saved', async () => {
		const features = { ...createEmptyFeaturesDraft('p'), lastSavedAt: '2026-11-02T10:00:00.000Z' };
		const glossary = { ...createEmptyGlossaryDraft('p'), lastSavedAt: '2026-11-17T08:00:00.000Z' };
		expect((await localCoherenceChecker({ features, glossary }).checker.analyze('p')).lastActivityAt).toBe('2026-11-17T08:00:00.000Z');
		expect((await localCoherenceChecker().checker.analyze('p')).lastActivityAt).toBeNull();
	});
});
