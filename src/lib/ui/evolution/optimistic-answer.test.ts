import { describe, expect, it } from 'vitest';
import { withPendingAnswer } from './optimistic-answer';

const saved = {
	path: '00-need.situation',
	value: 'Bags are never picked up.',
	filled: true,
	trail: { validation: 'validated' as const, versionCount: 1, validatedBy: ['bo'] }
};

describe('a saved answer shows at once, before the server answers (ac-evo-form-edit-optimistic)', () => {
	it('reads the new text as written and waiting, a validation given before outdated', () => {
		expect(withPendingAnswer(saved, 'Three bags a week are never picked up.')).toEqual({
			path: '00-need.situation',
			value: 'Three bags a week are never picked up.',
			filled: true,
			trail: { validation: 'outdated', versionCount: 1, outdatedBy: 'bo' }
		});
	});

	it('drops a refusal, and fills a question that was empty', () => {
		const refused = { ...saved, trail: { validation: 'refused' as const, versionCount: 1, refusedBy: 'bo', refusalReason: 'How many?' } };
		expect(withPendingAnswer(refused, 'Three a week.').trail).toEqual({ validation: 'unvalidated', versionCount: 1 });
		const empty = { path: 'step.solution.examples', value: '', filled: false, trail: { validation: 'unvalidated' as const, versionCount: 0 } };
		expect(withPendingAnswer(empty, 'A wrapped order shows a ribbon.')).toMatchObject({ filled: true, trail: { validation: 'unvalidated' } });
	});

	it('goes back to the answer as saved once nothing is pending, as after a failed save', () => {
		expect(withPendingAnswer(saved, null)).toBe(saved);
		expect(withPendingAnswer(saved, saved.value)).toBe(saved);
	});
});
