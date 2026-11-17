import { describe, expect, it } from 'vitest';
import { suggestionValidation, takenByValidateAll } from './section-validation';

/** Validate all of the Briefing takes the AI's suggestions as they stand (ac-evo-form-validate-each). */
describe('Validate all accepts the suggestions a section holds, then validates them [criterion:ac-leaf-ac-evo-form-validate-each]', () => {
	const situation = { id: 'p1', targetField: '00-need.situation', value: 'EVO-001 fixed the code.', decision: 'pending', acceptable: { ok: true }, ask: null };
	const objectives = { ...situation, id: 'p2', targetField: '00-need.objectives', value: 'The 17 leave.\nThe 2 leave with their reason.' };
	const origin = { ...situation, id: 'p3', targetField: 'request.origin', value: 'technical_debt' };

	it('accepts each suggestion as it stands, then validates the answer it wrote, in that order', () => {
		const act = suggestionValidation([situation, objectives]);
		expect(act.operations).toEqual([
			{ op: 'decide_proposal', proposalId: 'p1', decision: 'accept' },
			{ op: 'validate_field', fieldPath: '00-need.situation' },
			{ op: 'decide_proposal', proposalId: 'p2', decision: 'accept' },
			{ op: 'validate_field', fieldPath: '00-need.objectives' }
		]);
		// The page reads at once the suggestion gone, its value written and validated.
		expect(Object.keys(act.patches)).toEqual(expect.arrayContaining(['p:p1', 'p:p2']));
		expect(Object.values(act.patches)).toEqual(expect.arrayContaining([{ kind: 'text', value: 'EVO-001 fixed the code.' }]));
	});

	it('writes who asked and where it comes from on the request, not as an answer text', () => {
		expect(Object.values(suggestionValidation([origin]).patches)).toEqual(expect.arrayContaining([{ kind: 'request', origin: 'technical_debt' }]));
	});

	it('leaves waiting a suggestion that asks a question, one that cannot be accepted, and one already decided', () => {
		expect(takenByValidateAll(situation)).toBe(true);
		expect(takenByValidateAll({ ...situation, ask: { question: 'Who asked?', choices: [] } })).toBe(false);
		expect(takenByValidateAll({ ...situation, acceptable: { ok: false } })).toBe(false);
		expect(takenByValidateAll({ ...situation, decision: 'accepted' })).toBe(false);
		expect(suggestionValidation([{ ...situation, ask: { question: 'Who asked?', choices: [] } }]).operations).toEqual([]);
	});
});
