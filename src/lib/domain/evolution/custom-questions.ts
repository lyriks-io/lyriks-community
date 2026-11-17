import type { CustomQuestion, EvolutionRequest } from './draft';

/**
 * The questions asked of one request in particular (ac-evo-coach-custom-1..5).
 *
 * The generic questions of a step are the same for every request. These are
 * what someone asks after reading THIS one: "you write that many customers
 * forget: how many per week?". They are owed until a person answers them or
 * sets them aside, and an answer is a fact, never a specification value: the AI
 * client turns it into a proposal a person accepts.
 */

/** Five open questions is a conversation; more is an interrogation (ac-evo-coach-custom-2). */
export const MAX_OPEN_CUSTOM_QUESTIONS = 5;

export function openCustomQuestions(
	request: Pick<EvolutionRequest, 'customQuestions'>,
	step?: string
): CustomQuestion[] {
	return request.customQuestions.filter((q) => q.status === 'open' && (step === undefined || q.step === step));
}

/**
 * The open questions bearing on one field: what marks it incomplete, with the
 * question as the reason (ac-evo-coach-custom-4).
 */
export function openQuestionsOnField(
	request: Pick<EvolutionRequest, 'customQuestions'>,
	key: string
): CustomQuestion[] {
	return openCustomQuestions(request).filter((q) => q.fieldKey === key);
}
