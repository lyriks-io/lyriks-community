import { describe, expect, it } from 'vitest';
import { mergeActs, sectionStanding, sectionValidation, sectionWithdrawal, type HeldAnswer } from './section-validation';

const answer = (path: string, trail: HeldAnswer['trail'] = { validation: 'unvalidated' }, filled = true, leafId: string | null = null): HeldAnswer => ({ path, leafId, filled, trail });

describe('Validate on a section and on a whole step [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('sends a validation for every written answer the reader is not behind yet, and reads it at once', () => {
		const act = sectionValidation(
			[answer('00-need.situation'), answer('00-need.cost', { validation: 'validated', validatedBy: ['bo'] }), answer('00-need.symptoms', undefined, false)],
			[],
			'bo'
		);
		expect(act.operations).toEqual([{ op: 'validate_field', fieldPath: '00-need.situation' }]);
		expect(act.patches).toEqual({ 'v:00-need.situation': { kind: 'verdict', verdict: { act: 'validate' } } });
	});

	it('validates the step a section stands for with its answers, and a feature answer on its feature', () => {
		const act = sectionValidation([answer('ac', undefined, true, 'leaf-1')], [{ step: 'technical_spec', validatedBy: [], validated: false }], 'bo');
		expect(act.operations).toEqual([
			{ op: 'validate_field', fieldPath: 'ac', leafId: 'leaf-1' },
			{ op: 'validate_step', step: 'technical_spec' }
		]);
		expect(Object.keys(act.patches)).toEqual(['v:ac@leaf-1', 's:technical_spec']);
	});

	it('takes back only what the reader stands behind', () => {
		const act = sectionWithdrawal(
			[answer('a', { validation: 'validated', validatedBy: ['Bo'] }), answer('b', { validation: 'validated', validatedBy: ['ada'] })],
			[{ step: 'functional_spec', validatedBy: ['bo'], validated: true }],
			'bo'
		);
		expect(act.operations).toEqual([
			{ op: 'withdraw_field_verdict', fieldPath: 'a' },
			{ op: 'withdraw_step_validation', step: 'functional_spec' }
		]);
	});

	it('waits on the reader while something written is not theirs and not settled; an empty section waits on nobody', () => {
		expect(sectionStanding([answer('a')], [], 'bo').waits).toBe(true);
		expect(sectionStanding([answer('a', undefined, false)], [], 'bo').waits).toBe(false);
		expect(sectionStanding([answer('a', { validation: 'validated', validatedBy: ['bo'] })], [], 'bo')).toMatchObject({ mine: true, waits: false });
		// A refused answer is not one the reader stands behind.
		expect(sectionStanding([answer('a', { validation: 'refused', validatedBy: ['bo'] })], [], 'bo').mine).toBe(false);
	});

	it('sends several sections as one save, in order', () => {
		const act = mergeActs([sectionValidation([answer('a')], [], 'bo'), sectionValidation([answer('b')], [], 'bo')]);
		expect(act.operations.map((o) => o.fieldPath)).toEqual(['a', 'b']);
		expect(Object.keys(act.patches)).toEqual(['v:a', 'v:b']);
	});
});
