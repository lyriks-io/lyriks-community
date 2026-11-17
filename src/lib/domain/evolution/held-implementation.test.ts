import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { draftCriterionRows, draftIndexKeys, heldStatusOf, isLanded, mergedStatus, withHeldEntries } from './held-implementation';
import { deriveImplementationReport } from './report-derivation';

/**
 * The code written against a version nobody made official yet
 * (ac-evo-impl-held, ac-evo-req-landing): what names the request's additions
 * is held on the request and read by its report; the change is official only
 * once the Build is accepted.
 */

const feature = {
	surfaces: [
		{
			id: 's1',
			name: 'Basket',
			stateDefinitions: [{ id: 'st1', path: 'order.status' }, { id: 'st2', path: 'slot.orderCount' }],
			invariants: [],
			actions: [
				{
					id: 'a1',
					name: 'Place the order',
					rules: [{ id: 'r-old', description: 'Empty basket refused' }, { id: 'r-cap', description: 'Twenty per slot' }],
					transitions: [],
					emittedEvents: ['order.placed']
				}
			]
		}
	]
};
const base = {
	surfaces: [
		{
			id: 's1',
			name: 'Basket',
			stateDefinitions: [{ id: 'st1', path: 'order.status' }],
			actions: [{ id: 'a1', name: 'Place the order', rules: [{ id: 'r-old', description: 'Empty basket refused' }], emittedEvents: ['order.placed'] }]
		}
	]
};

describe('an index entry may name what a draft adds before it is official', () => {
	it('lists every key the draft makes, in the grammar of .unspa.json', () => {
		const draft = createDraftLeaf({ kind: 'amend', baseLeafId: 'feat-order', acceptanceCriteria: [{ id: 'c1', text: 'The 21st order is refused.' }] });
		expect(draftIndexKeys(feature, draft).sort()).toEqual(
			['action:a1', 'criterion:ac-leaf-c1', 'event:order.placed', 'rule:r-cap', 'rule:r-old', 'state:order.status', 'state:slot.orderCount', 'surface:s1'].sort()
		);
	});

	it('reads the held entries like synced ones, and only for what the specification does not hold yet', () => {
		const official = new Set(draftIndexKeys(base, { acceptanceCriteria: [] }));
		const held = {
			'rule:r-cap': { file: 'src/order.js', line: 12, signature: 'if (slot.count >= 20) return refused();' },
			'criterion:ac-leaf-c1': { verification: { lastResult: { passed: true } } }
		};
		const status = heldStatusOf(feature, held, [{ id: 'c1', text: 'The 21st order is refused.' }], official);
		expect(status.actions).toHaveLength(1);
		expect(status.actions?.[0].expectedEntities?.map((e) => `${e.entityType}:${e.entityId}`)).toEqual(['rule:r-cap']);
		expect(status.actions?.[0].foundEntities?.[0].locations?.[0]).toMatchObject({ file: 'src/order.js', line: 12 });
		expect(status.surfaces?.[0].expectedEntities?.map((e) => e.entityId)).toEqual(['st2']);
		expect(status.criteria).toEqual([{ criterionId: 'ac-leaf-c1', title: 'The 21st order is refused.', state: 'verified' }]);

		const lines = deriveImplementationReport({
			request: { id: 'req', iteration: 1, specVersion: 1, leafIds: ['feat-order'] },
			statuses: { 'feat-order': mergedStatus(null, status) },
			neighbours: {},
			leafNames: { 'feat-order': 'Order online' }
		});
		expect(lines.find((l) => l.requirement.includes('Twenty per slot'))).toMatchObject({ verdict: 'non_conform', filePath: 'src/order.js' });
		expect(lines.find((l) => l.requirement.includes('slot.orderCount'))?.verdict).toBe('missing');
		expect(lines.find((l) => l.specStatement === 'The 21st order is refused.')?.verdict).toBe('conform');
	});

	it('keeps the newest entry of each key', () => {
		const request = withHeldEntries(withHeldEntries(createEvolutionRequest(), { 'rule:r-cap': { line: 1 } }), { 'rule:r-cap': { line: 9 } });
		expect(request.heldImplementation['rule:r-cap']).toEqual({ line: 9 });
	});
});

describe('a rule added to an official action', () => {
	it('is proved by the scenarios of its action, as the engine stamps them', () => {
		const official = { actions: [{ actionId: 'a1', actionName: 'Place the order', auditMeta: { verifiedAt: '2026-10-07T16:00:00.000Z' } }] };
		const held = { actions: [{ actionId: 'a1', actionName: 'Place the order', expectedEntities: [{ entityType: 'rule', entityId: 'r-cap' }] }] };
		expect(mergedStatus(official, held).actions?.[1].auditMeta).toEqual({ verifiedAt: '2026-10-07T16:00:00.000Z' });
	});
});

describe('the change is official only once it is declared live (ac-evo-req-landing)', () => {
	it('reads a request in Build, in Approval or waiting for its deployment as not landed, and one declared live as landed', () => {
		expect(isLanded(createEvolutionRequest({ stage: 'implementation', frozen: true }))).toBe(false);
		expect(isLanded(createEvolutionRequest({ stage: 'acceptance' }))).toBe(false);
		expect(isLanded(createEvolutionRequest({ stage: 'delivered' }))).toBe(false);
		const live = { releaseId: null, note: '', declaredBy: 'ana', declaredAt: '2026-10-08' };
		expect(isLanded(createEvolutionRequest({ stage: 'delivered', deployment: live }))).toBe(true);
		expect(isLanded(createEvolutionRequest({ stage: 'specification', status: 'closed' }))).toBe(true);
	});
});

describe('a draft read as a feature names its own criteria under the key its report reads', () => {
	it('lists the criteria it carries and the ones signed on it, each once, as ac-leaf-<id>', () => {
		const rows = draftCriterionRows({ acceptanceCriteria: [{ id: 'c1', text: 'The 21st order is refused.' }] }, [
			{ id: 'c1', text: 'The 21st order is refused.' },
			{ id: 'c2', text: 'A signed one.' }
		]);
		expect(rows).toEqual([
			{ id: 'ac-leaf-c1', title: 'The 21st order is refused.' },
			{ id: 'ac-leaf-c2', title: 'A signed one.' }
		]);
	});
});
