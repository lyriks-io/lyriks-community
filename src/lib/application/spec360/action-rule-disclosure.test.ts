import { describe, expect, it } from 'vitest';
import { actionRulesShown } from './action-rule-disclosure';

describe('an action’s rules stay folded until the reader opens them [criterion:54bd4e66]', () => {
	const state = { editing: false, targeted: false };
	it('starts folded', () => {
		expect(actionRulesShown(state)).toBe(false);
	});
	it('opens and folds again on the reader’s choice', () => {
		expect(actionRulesShown({ ...state, choice: true })).toBe(true);
		expect(actionRulesShown({ ...state, choice: false })).toBe(false);
	});
	it('opens the rules a link aims at, unless the reader folded them', () => {
		expect(actionRulesShown({ ...state, targeted: true })).toBe(true);
		expect(actionRulesShown({ ...state, targeted: true, choice: false })).toBe(false);
	});
	it('keeps the rules open in Edit mode even after a manual hide', () => {
		expect(actionRulesShown({ ...state, editing: true, choice: false })).toBe(true);
	});
});
