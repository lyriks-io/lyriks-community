/**
 * Where one question of the dossier stands, read at a glance on its card
 * (ac-evo-form-question-state). What a person still owes comes first: a
 * required answer missing, postponed or waiting for a signature reads before
 * anything about validation, so the holes are what the eye finds.
 */
export type QuestionState =
	| 'missing'
	| 'postponed'
	| 'to_sign'
	| 'optional'
	| 'refused'
	| 'skipped'
	| 'validated'
	| 'to_validate';

export interface QuestionFacts {
	readonly filled: boolean;
	readonly required: boolean;
	readonly openQuestion: boolean;
	readonly skipped: boolean;
	readonly proposalWaiting: boolean;
	/** The trail's validation status of the current version. */
	readonly validation: string | undefined;
}

export function questionState(facts: QuestionFacts): QuestionState {
	if (facts.openQuestion) return 'postponed';
	if (facts.proposalWaiting) return 'to_sign';
	if (!facts.filled) return facts.skipped ? 'skipped' : facts.required ? 'missing' : 'optional';
	if (facts.validation === 'refused') return 'refused';
	if (facts.validation === 'validated') return 'validated';
	return 'to_validate';
}
