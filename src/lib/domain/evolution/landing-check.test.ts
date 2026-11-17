import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { landedFeatureOf, landingCheck, type LandingSpec } from './landing-check';

/** Everything a live request carried, read again on the specification as it stands [criterion:ac-leaf-ac-evo-verd-landed-check]. */

const at = '2026-10-29T15:41:02.553Z';
const feature = {
	id: 'feat-users',
	surfaces: [
		{
			id: 'table',
			stateDefinitions: [{ path: 'user.isMe', type: 'boolean' }],
			actions: [
				{
					id: 'ban',
					rules: [
						{ id: 'gone', description: 'The account may have been deleted since the dialog opened.', effect: { type: 'block_action', reason: 'No user has been found.' } },
						{ id: 'self', description: 'An admin cannot ban themselves.' }
					],
					scenarios: [{ id: 'sc-self', name: 'An admin cannot ban their own account' }]
				}
			]
		}
	]
};
const request = createEvolutionRequest({
	status: 'closed',
	drafts: [
		createDraftLeaf({
			id: 'draft:users',
			kind: 'amend',
			baseLeafId: 'feat-users',
			name: 'Manage users',
			acceptanceCriteria: [{ id: 'c-new', text: 'An admin cannot ban their own account.' }],
			changeCriteria: [{ id: 'c-old', text: 'A deleted account is named as not found.' }],
			retireCriteria: ['c-retired'],
			behaviourModel: {
				operations: [],
				mintedIds: [],
				updatedAt: at,
				landed: {
					mintedIds: ['self', 'sc-self'],
					operations: [
						{ kind: 'update_action_rule', ruleId: 'gone', patch: { description: 'The account may have been deleted since the dialog opened.', effect: { reason: 'No user has been found.' } } },
						{ kind: 'add_state', path: 'user.isMe', type: 'boolean' },
						{ kind: 'add_action_rule', actionId: 'ban', rule: { description: 'An admin cannot ban themselves.' } },
						{ kind: 'remove_effect', effectId: 'old-effect' }
					]
				}
			},
			materialisedAt: at
		})
	],
	dataDrafts: [
		{ id: 'data:d1', kind: 'amend', entityId: 'entity-domain', name: '', description: '', addFields: [{ id: 'f1', name: 'addedByAdmin', type: 'boolean', required: true, list: false, relationTo: null }], changeFields: [], removeFields: [], materialisedAs: 'entity-domain', materialisedAt: at }
	],
	sectionDrafts: [{ id: 'section:s1', page: 'requirements', summary: 'Encryption in transit is stated.', edits: [], sourceIds: [], materialisedAt: at }],
	ruleDrafts: [{ id: 'rules:r1', summary: 'Two lines the whole product keeps.', operations: [{ kind: 'add_project_invariant', name: 'An expired link never sends a visitor to its target' }], sourceIds: [], materialisedAt: at }]
});

const spec = (over: Partial<LandingSpec> = {}): LandingSpec => ({
	feature: (id) => (id === 'feat-users' ? landedFeatureOf(feature) : null),
	leaf: (id) =>
		id === 'feat-users'
			? { name: 'Manage users', criteria: [{ id: 'c-new', text: 'An admin cannot ban their own account.' }, { id: 'c-old', text: 'A deleted account is named as not found.' }] }
			: null,
	entity: (id) => (id === 'entity-domain' ? { name: 'Domain', fields: [{ id: 'f1', name: 'addedByAdmin' }] } : null),
	sectionHolds: () => true,
	invariants: [{ id: 'inv-1', name: 'An expired link never sends a visitor to its target' }],
	...over
});

describe('the landing checked again on the specification [criterion:ac-leaf-ac-evo-verd-landed-check]', () => {
	it('finds everything a request carried once it is in the specification', () => {
		const check = landingCheck(request, spec());
		expect(check.missing).toEqual([]);
		// 2 minted elements, the rule changed, the state added, the effect removed; 3 criteria; 1 field; 1 page; 1 rule.
		expect(check).toMatchObject({ carried: 11, found: 11 });
	});

	it('names, by feature, an element that is not there or does not read as the change wrote it', () => {
		const reworded = { ...feature, surfaces: [{ ...feature.surfaces[0], actions: [{ ...feature.surfaces[0].actions[0], rules: [{ id: 'gone', description: 'Something else.' }] }] }] };
		const check = landingCheck(request, spec({ feature: () => landedFeatureOf(reworded) }));
		expect(check.found).toBe(check.carried - 2);
		expect(check.missing).toEqual([
			{ where: 'Manage users', what: 'An element the change added (self) is not in the feature.' },
			{ where: 'Manage users', what: 'The rule "The account may have been deleted since the dialog opened." does not read as the change wrote it.' }
		]);
	});

	it('names a criterion, a field, a page and a rule that are missing', () => {
		const check = landingCheck(
			request,
			spec({
				leaf: () => ({ name: 'Manage users', criteria: [{ id: 'c-retired', text: 'Old line.' }] }),
				entity: () => ({ name: 'Domain', fields: [] }),
				sectionHolds: () => false,
				invariants: []
			})
		);
		expect(check.missing.map((m) => m.what)).toEqual([
			'The acceptance criterion "An admin cannot ban their own account." is not in the feature.',
			'The acceptance criterion "A deleted account is named as not found." does not read as the change reworded it.',
			'The acceptance criterion c-retired the change retired is still there.',
			'The field addedByAdmin is not in the table.',
			'"Encryption in transit is stated." is not on the page.',
			'The rule "An expired link never sends a visitor to its target" is not among them.'
		]);
	});

	it('reads a list the change wrote item by item, whatever order the engine keeps their keys in', () => {
		const assertions = [{ path: 'visit.destination', operator: 'equals', value: 'target' }];
		const stored = { id: 'f', surfaces: [{ id: 's', actions: [{ id: 'a', scenarios: [{ id: 'sc', expectedAssertions: [{ value: 'target', path: 'visit.destination', operator: 'equals' }] }] }] }] };
		const change = createEvolutionRequest({
			drafts: [
				createDraftLeaf({
					kind: 'amend',
					baseLeafId: 'f',
					behaviourModel: { operations: [], mintedIds: [], updatedAt: at, landed: { mintedIds: [], operations: [{ kind: 'update_scenario', scenarioId: 'sc', patch: { expectedAssertions: assertions } }] } },
					materialisedAt: at
				})
			]
		});
		const read = (feature: unknown) => landingCheck(change, spec({ feature: () => landedFeatureOf(feature), leaf: () => ({ name: 'F', criteria: [] }) }));
		expect(read(stored)).toMatchObject({ carried: 1, found: 1 });
		expect(read({ ...stored, surfaces: [{ id: 's', actions: [{ id: 'a', scenarios: [{ id: 'sc', expectedAssertions: [] }] }] }] }).found).toBe(0);
	});

	it('checks nothing the landing has not written', () => {
		const open = { ...request, drafts: request.drafts.map((d) => ({ ...d, materialisedAt: null })), dataDrafts: [], sectionDrafts: [], ruleDrafts: [] };
		expect(landingCheck(open, spec())).toEqual({ carried: 0, found: 0, missing: [] });
	});
});
