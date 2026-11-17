import { firstRefusal, guard, type Guarded, type Refused } from './guard';
import { personKey } from './named-validators';
import type { EvolutionRequest, Proposal, ProposalAsk, ProposalExchange } from './draft';

/**
 * The question the AI asks with its suggestion (ac-evo-live-card-ask): the one
 * fact it is missing, a few answers a click gives, and the person's answer,
 * which the AI folds into the suggestion that replaces it. One question at a
 * time, in a suggestion as in a thread (ac-evo-live-one-question).
 */

/** maxSuggestionChoices of feat-evo-live-session. */
export const MAX_SUGGESTION_CHOICES = 3;
/** maxMultipleChoices of feat-evo-live-session: answers to tick when a question takes several. */
export const MAX_MULTIPLE_CHOICES = 6;

export const ONE_QUESTION = 'Ask one question at a time: the one that changes your suggestion most.';
export const ASK_IN_SUGGESTION = 'Ask it in your suggestion, where the person reads it with the value.';

/** How many questions a text asks, read off its question marks, Latin or full-width. */
export const questionMarksIn = (text: string): number => (text.match(/[?？]/g) ?? []).length;

export interface AskInput {
	readonly question: string;
	readonly choices: readonly string[];
	/** The question takes several answers, ticked rather than clicked (ac-evo-live-choices). */
	readonly multiple?: boolean;
}

export const cleanChoices = (choices: readonly string[]) => choices.map((c) => c.trim()).filter((c) => c !== '');

/** Whether a question offers few enough answers as buttons: a handful to click, a few more to tick (ac-evo-live-choices). */
export function choicesAllowed(choices: readonly string[], multiple = false): Guarded {
	const max = multiple ? MAX_MULTIPLE_CHOICES : MAX_SUGGESTION_CHOICES;
	return guard(
		cleanChoices(choices).length > max,
		multiple ? `Offer ${max} answers to tick at most: the person's own words go in the box beside them.` : `Offer ${max} answers at most: the person's own words go in the box beside them.`,
		'A handful of answers a click gives, never a form.'
	);
}

/** Whether the AI may ask this with its suggestion (rules of "The AI suggests with one question"). */
export function askAllowed(input: AskInput): Guarded {
	const choices = cleanChoices(input.choices);
	return firstRefusal(
		guard(input.question.trim() === '' && choices.length > 0, 'Answers need the question they answer.', 'The answers a click gives sit under the question of the suggestion.'),
		guard(questionMarksIn(input.question) > 1, ONE_QUESTION, 'One question at a time keeps the dialogue light; the next one comes with the rewritten suggestion.'),
		choicesAllowed(choices, input.multiple)
	);
}

/** The ask a suggestion carries; none when the AI asks nothing. */
export function askOf(input: AskInput): ProposalAsk | undefined {
	const question = input.question.trim();
	return question === '' ? undefined : { question, choices: cleanChoices(input.choices), ...(input.multiple ? { multiple: true as const } : {}) };
}

/** Whether the AI's next suggestion on the field replaces this one: its own, still waiting, its question answered. */
export function replaceableBy(proposal: Proposal, actorId: string): boolean {
	return proposal.decision === 'pending' && !!proposal.ask?.answer && personKey(proposal.proposedBy) === personKey(actorId);
}

/** What the suggestion that replaces this one keeps: every earlier exchange, then the one just answered. */
export function dialogueAfter(replaced: Proposal): ProposalExchange[] {
	const earlier = replaced.dialogue ?? [];
	const answer = replaced.ask?.answer;
	if (!replaced.ask || !answer) return [...earlier];
	return [...earlier, { question: replaced.ask.question, answer: answer.body, by: answer.by, at: answer.at }];
}

export type AnswerOutcome = { readonly ok: true; readonly request: EvolutionRequest; readonly proposal: Proposal } | Refused;

/** The person answers the question of a suggestion ("Answer the question in the suggestion"). */
export function answerSuggestion(request: EvolutionRequest, personId: string, proposalId: string, body: string, at: string): AnswerOutcome {
	const proposal = request.proposals.find((p) => p.id === proposalId);
	const text = body.trim();
	const allowed = firstRefusal(
		guard(!proposal || proposal.decision !== 'pending', 'This suggestion no longer waits.', 'It was decided or replaced, and its question went with it.'),
		guard(!proposal?.ask, 'Lyriks asked nothing in this suggestion.', 'Only a question waiting in the suggestion is answered there.'),
		guard(!!proposal?.ask?.answer, 'You already answered: Lyriks is rewriting the suggestion.', 'The next question, if one is left, comes with the rewritten suggestion.'),
		guard(text === '', 'Write your answer, or click one of the answers offered.', 'An empty answer tells Lyriks nothing.')
	);
	if (!allowed.ok || !proposal?.ask) return allowed as Refused;
	const answered: Proposal = { ...proposal, ask: { ...proposal.ask, answer: { body: text, by: personId, at } } };
	return { ok: true, proposal: answered, request: { ...request, proposals: request.proposals.map((p) => (p.id === proposalId ? answered : p)) } };
}

/**
 * Whether the AI may post this message that waits for the person's answer
 * (rules of "The AI asks the person in its reply"): one question, and a
 * question about its own waiting suggestion goes in the suggestion.
 */
export function threadQuestionAllowed(body: string, opensTopic: boolean, ownSuggestionWaits: boolean): Guarded {
	return firstRefusal(
		guard(questionMarksIn(body) > 1, ONE_QUESTION, 'One question at a time, in a reply as in a suggestion.'),
		guard(opensTopic && ownSuggestionWaits, ASK_IN_SUGGESTION, 'The thread stays for people: propose again with the question instead (withdraw_proposal first).')
	);
}
