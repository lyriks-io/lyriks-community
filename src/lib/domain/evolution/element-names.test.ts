import { describe, expect, it } from 'vitest';
import { behaviourElementNames } from './element-names';
import { draftChangeNodes } from './decision-figures';

const FEATURE = {
	surfaces: [
		{
			id: 's1',
			name: 'Admin users table',
			rules: [{ id: 'sr1', description: 'Only an admin sees the table' }],
			actions: [
				{
					id: 'a1',
					name: 'Ban a user',
					rules: [{ id: 'r1', description: '', effect: { type: 'block_action', reason: 'No user has been found.' } }],
					scenarios: [{ id: 'sc1', name: 'Banning a banned account says so' }],
					effects: [{ id: 'e1', description: 'The user is banned' }],
					parameters: [{ id: 'p1', name: 'reason' }]
				}
			]
		}
	]
};

describe('a draft names every element it changes [criterion:ac-leaf-ac-evo-draft-changes-named]', () => {
	it('reads the names of a feature by id, each with the action and screen it sits in', () => {
		const names = behaviourElementNames(FEATURE);
		expect(names.a1).toEqual({ name: 'Ban a user', in: 'Admin users table' });
		// A rule with no sentence of its own reads by the sentence it refuses with.
		expect(names.r1).toEqual({ name: 'No user has been found.', in: 'Ban a user · Admin users table' });
		expect(names.sr1).toEqual({ name: 'Only an admin sees the table', in: 'Admin users table' });
		expect(names.sc1.name).toBe('Banning a banned account says so');
		expect(names.e1.name).toBe('The user is banned');
		expect(behaviourElementNames(null)).toEqual({});
	});

	it('lists what the drafts change by name, never by the kind alone, from the operation or from the feature it amends', () => {
		const changes = draftChangeNodes(
			[
				{
					kind: 'amend',
					baseLeafId: 'feat-users',
					behaviourModel: {
						operations: [
							{ kind: 'update_action_rule', ruleId: 'r1', actionId: 'a1', surfaceId: 's1', patch: { description: 'Refused: the account no longer exists' } },
							{ kind: 'update_scenario', scenarioId: 'sc1', actionId: 'a1', surfaceId: 's1', patch: { name: 'Banning twice says banned already' } },
							{ kind: 'remove_effect', effectId: 'e1', actionId: 'a1', surfaceId: 's1' },
							{ kind: 'add_action_rule', actionId: 'a1', surfaceId: 's1', rule: { description: '', effect: { type: 'block_action', reason: 'You cannot ban your own account.' } } },
							{ kind: 'remove_effect', effectId: 'gone', actionId: 'a1', surfaceId: 's1' }
						]
					}
				}
			],
			(leafId) => (leafId === 'feat-users' ? behaviourElementNames(FEATURE) : undefined)
		);
		expect(changes).toEqual([
			// An element that exists reads by the name people know it by.
			{ kind: 'rule', label: 'No user has been found.', status: 'changed', id: 'r1', in: 'Ban a user · Admin users table' },
			{ kind: 'scenario', label: 'Banning a banned account says so', status: 'changed', id: 'sc1', in: 'Ban a user · Admin users table' },
			{ kind: 'effect', label: 'The user is banned', status: 'removed', id: 'e1', in: 'Ban a user · Admin users table' },
			// A new one by its own words, in the action the operation names.
			{ kind: 'rule', label: 'You cannot ban your own account.', status: 'added', in: 'Ban a user · Admin users table' },
			// An id the feature does not know still reads by its kind AND its id.
			{ kind: 'effect', label: 'effect gone', status: 'removed', id: 'gone', in: 'Ban a user · Admin users table' }
		]);
		expect(changes.every((c) => !['rule', 'scenario', 'effect'].includes(c.label))).toBe(true);
	});

	it('reads the words an update carries when the feature is not at hand', () => {
		const [rule] = draftChangeNodes([
			{ kind: 'amend', baseLeafId: 'feat-users', behaviourModel: { operations: [{ kind: 'update_action_rule', ruleId: 'r1', actionId: 'a1', patch: { effect: { reason: 'User has been banned already.' } } }] } }
		]);
		expect(rule).toEqual({ kind: 'rule', label: 'User has been banned already.', status: 'changed', id: 'r1', in: 'a1' });
	});
});
