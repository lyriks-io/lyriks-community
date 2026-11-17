import { describe, expect, it } from 'vitest';
import { NEED_FIELDS } from './blocks';
import { DESCRIBED_STEPS, STEP_QUESTIONS } from './draft';
import { EVOLUTION_STEPS } from './path';
import { questionFrame, questionText, stepPurposeText } from './question-texts';

/**
 * The questions of the steps of prose read in the language the spec is
 * written in (ac-evo-form-spec-language): none of them is left in English in a
 * French spec, and an English spec reads them as they are declared.
 */
describe('the questions read in the spec language [criterion:ac-leaf-ac-evo-form-spec-language]', () => {
	const paths = [
		...NEED_FIELDS.map((f) => f.path),
		...DESCRIBED_STEPS.map((step) => `step.${step}.description`),
		...STEP_QUESTIONS.map((q) => `step.${q.step}.${q.key}`)
	];

	it('says every question of the steps of prose in French, label, question, example and why', () => {
		for (const path of paths) {
			const said = questionText('fr', path);
			expect(said, path).not.toBeNull();
			expect([said!.label, said!.question, said!.example, said!.why].every((t) => t.trim() !== ''), path).toBe(true);
		}
		for (const step of EVOLUTION_STEPS) expect(stepPurposeText('fr', step.code), step.code).toBeTruthy();
		expect(questionFrame('fr').answerMyself(2)).toBe('Répondre moi-même aux 2 questions');
	});

	it('leaves an English spec, or a question it does not know, as declared', () => {
		for (const path of paths) expect(questionText('en', path)).toBeNull();
		expect(questionText('fr', '01-idea.objective')).toBeNull();
		expect(stepPurposeText('en', 'functional_spec')).toBeNull();
		expect(questionFrame('en').required).toBe('Required');
	});
});
