import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { localGraphOf } from './local-graph';
import { elementPath, reviewActions } from './spec-actions';
import { countsSpecificationActions, specificationHold } from './specification-hold';
import { fieldKey } from './blocks';
import { fieldValidationOf } from './field-versions';
import { validateFieldAct } from './acts';
import { landedCriteria } from './materialise';

/**
 * Criterion c0a6eef3: a validation stands behind what the change lands. An
 * existing action is reviewed as soon as its rules, effects, parameters or
 * scenarios differ from the feature's, a later edit of any of them sets it
 * waiting again, and the gate counts the actions before the freeze at every stage.
 */
const action = (extra: Record<string, unknown> = {}) => ({
	id: 'b3fdea10',
	name: 'Turn points into a change',
	rules: [{ id: 'r1', description: 'Only someone who may write opens one.' }],
	transitions: [],
	emittedEvents: [],
	parameters: [],
	scenarios: [],
	onBlockedEffects: [{ id: '66899df2', type: 'show_message', message: 'Not saved.' }],
	...extra
});
const feature = (a: Record<string, unknown>) => ({ surfaces: [{ id: 's1', name: 'Health', stateDefinitions: [], invariants: [], actions: [a] }] });
const draft = createDraftLeaf({ id: 'draft:h', kind: 'amend', baseLeafId: 'feat-123', name: '' });
const request = createEvolutionRequest({ id: 'r', leafIds: ['feat-123', 'draft:h'], drafts: [draft] });
const graphOf = (drafted: Record<string, unknown>) =>
	localGraphOf({ request, cores: [{ id: 'c', name: 'Health' }], leaves: [{ id: 'feat-123', name: 'Review what Lyriks noticed', coreId: 'c' }], base: { 'feat-123': feature(action()) }, drafted: { 'draft:h': feature(drafted) } });
const reviewed = (drafted: Record<string, unknown>) => reviewActions(graphOf(drafted), 'feature:feat-123');
const ctx = { actor: { id: 'ana', kind: 'person', role: 'owner' }, at: '2026-11-20T01:00:00.000Z', newId: () => 'v1' } as unknown as Parameters<typeof validateFieldAct>[0];

describe('a validation stands behind what the change lands [criterion:c0a6eef3]', () => {
	it('reviews an existing action whose scenario, effect or parameter alone changed, and never one the draft leaves as it was', () => {
		expect(reviewed(action())).toEqual([]);
		expect(reviewed(action({ scenarios: [{ id: 'sc1', name: 'A viewer opens nothing' }] })).map((s) => s.action.id)).toEqual(['action:b3fdea10']);
		expect(reviewed(action({ onBlockedEffects: [{ id: '66899df2', type: 'show_message', message: 'The change was not opened.' }] }))).toHaveLength(1);
		expect(reviewed(action({ parameters: [{ id: 'p1', name: 'pointIds', type: 'string' }] }))).toHaveLength(1);
	});

	it('sets a validated action waiting again when its effect changes after the validation', () => {
		const first = reviewed(action({ rules: [...action().rules, { id: 'b09ed5a6', description: 'A Community installation opens no change.' }] }))[0];
		const key = fieldKey(elementPath(first.action.id), 'feature:feat-123');
		const validated = validateFieldAct(ctx, request, { key, liveValue: first.fingerprint });
		expect(validated.ok).toBe(true);
		if (!validated.ok) return;
		expect(fieldValidationOf(validated.request, key, first.fingerprint).status).toBe('validated');
		// The onBlocked effect is reworded on the draft afterwards: same rules, other content.
		const later = reviewed(
			action({
				rules: [...action().rules, { id: 'b09ed5a6', description: 'A Community installation opens no change.' }],
				onBlockedEffects: [{ id: '66899df2', type: 'show_message', message: 'Evolutions are available from the Solo Builder plan.' }]
			})
		)[0];
		expect(later.fingerprint).not.toBe(first.fingerprint);
		const trail = fieldValidationOf(validated.request, key, later.fingerprint);
		expect(trail.status).toBe('changed_outside');
		expect(specificationHold([{ validation: trail.status }]).validated).toBe(0);
	});

	it('counts the actions of the Specification at every stage before the freeze', () => {
		expect(['specification', 'coherence'].map(countsSpecificationActions)).toEqual([true, true]);
		expect(['draft', 'implementation', 'acceptance', 'delivered'].map(countsSpecificationActions)).toEqual([false, false, false, false]);
	});

	it('reads the criteria an amendment lands: rewordings and retirements applied, additions after', () => {
		const before = [
			{ id: 'c-team', text: 'Share the project names Small Team.' },
			{ id: 'c-old', text: 'An old promise.' }
		];
		const landed = landedCriteria(before, { changeCriteria: [{ id: 'c-team', text: 'Share the project names Team.' }], retireCriteria: ['c-old'], acceptanceCriteria: [{ id: 'n1', text: 'View plans opens the pricing.' }] }, undefined);
		expect(landed.map((c) => c.text)).toEqual(['Share the project names Team.', 'View plans opens the pricing.']);
	});
});
