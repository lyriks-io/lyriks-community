import { describe, expect, it } from 'vitest';
import { questionState, type QuestionFacts } from './question-state';

const facts = (over: Partial<QuestionFacts> = {}): QuestionFacts => ({
	filled: false,
	required: false,
	openQuestion: false,
	skipped: false,
	proposalWaiting: false,
	validation: undefined,
	...over
});

describe('a question card says where it stands at a glance (ac-evo-form-question-state)', () => {
	it('reads what a person still owes before anything about validation', () => {
		expect(questionState(facts({ required: true }))).toBe('missing');
		expect(questionState(facts())).toBe('optional');
		expect(questionState(facts({ required: true, openQuestion: true }))).toBe('postponed');
		expect(questionState(facts({ required: true, proposalWaiting: true }))).toBe('to_sign');
		expect(questionState(facts({ required: true, skipped: true }))).toBe('skipped');
	});

	it('reads an answer by its verdict', () => {
		expect(questionState(facts({ filled: true }))).toBe('to_validate');
		expect(questionState(facts({ filled: true, validation: 'validated' }))).toBe('validated');
		expect(questionState(facts({ filled: true, validation: 'refused' }))).toBe('refused');
	});
});
