import { pointsOf } from './prose-statements';
import { blockFieldByPath } from './blocks';
import { DESCRIBED_STEPS, isDescribedStep, STEP_QUESTIONS, stepQuestionOf, type Actor, type FieldThread, type FieldThreadMessage, type SuggestedWrite, type SuggestionDecision } from './draft';
import { FUNCTIONAL_DIAGRAM_KEY } from './functional-diagram';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The suggestion an AI message carries (ac-evo-live-comment-suggests): the
 * requirement candidates it offers, each at its place, which a person
 * accepts or rejects independently in Solution. It is how the AI offers a text in a conversation, never as words
 * for the person to copy, and how it writes a step in a workspace of several
 * members, where it writes no version itself (ac-evo-live-shared-writes).
 */

/** Where one value of a suggestion lands: a step's description, or one of its questions. */
export type SuggestionPlace =
	| { readonly kind: 'description'; readonly step: string }
	| { readonly kind: 'question'; readonly step: string; readonly key: string };

const NEED_VERBATIM = '00-need.description';
const PROSE = /^step\.([a-z_]+)\.([a-z_]+)$/;

/** The place a field path names, or null when it is no text of a step a suggestion can write. */
export function suggestionPlaceOf(fieldPath: string): SuggestionPlace | null {
	const prose = PROSE.exec(fieldPath);
	if (!prose) return null;
	const [, step, key] = prose;
	if (key === 'description') return isDescribedStep(step) ? { kind: 'description', step } : null;
	if (key === FUNCTIONAL_DIAGRAM_KEY) return null;
	return stepQuestionOf(step, key) ? { kind: 'question', step, key } : null;
}

const STEP_NAMES: Readonly<Record<string, string>> = { solution: 'Solution', functional_spec: 'Functional spec', technical_spec: 'Technical spec' };

/** Every place a suggestion can write, with what it holds, as the AI is told them: the texts of the steps of prose. */
export function suggestionPlaces(): readonly { readonly fieldPath: string; readonly label: string }[] {
	return [
		...DESCRIBED_STEPS.map((step) => ({ fieldPath: `step.${step}.description`, label: `${STEP_NAMES[step]}: its description` })),
		...STEP_QUESTIONS.filter((q) => q.key !== FUNCTIONAL_DIAGRAM_KEY).map((q) => ({ fieldPath: `step.${q.step}.${q.key}`, label: `${STEP_NAMES[q.step]}: ${q.label}` }))
	];
}

const isDiagram = (fieldPath: string) => PROSE.exec(fieldPath)?.[2] === FUNCTIONAL_DIAGRAM_KEY;

/** The writes as sent, trimmed, the empty ones kept so the guard can name them. */
export function cleanWrites(raw: readonly { readonly fieldPath?: unknown; readonly value?: unknown }[]): SuggestedWrite[] {
	return raw.map((w) => ({
		fieldPath: typeof w.fieldPath === 'string' ? w.fieldPath.trim() : '',
		value: typeof w.value === 'string' ? w.value.trim() : ''
	}));
}

/** Whether a suggestion may be posted with these places, each refusal the sentence the spec chose (action 8b278fb0). */
export function suggestionAllowed(writes: readonly SuggestedWrite[]): Guarded {
	const paths = writes.map((w) => w.fieldPath);
	return firstRefusal(
		guard(writes.length === 0, 'Name each place your text goes: writes [{ fieldPath, value }].', 'A suggestion offers each text at the place it would write.'),
		guard(
			paths.some((p) => p === NEED_VERBATIM || isDiagram(p)),
			"The Need's verbatim stays the requester's words and a diagram is drawn: suggest a text of a step.",
			'A diagram is drawn with Draw with my AI; the verbatim is written by the person who asks.'
		),
		guard(
			paths.some((p) => !!blockFieldByPath(p)),
			'A field of a block takes a proposal: propose it there.',
			'A proposal shows on the field itself, with Accept and Refuse.'
		),
		guard(
			paths.some((p) => !suggestionPlaceOf(p)),
			`No text of a step is named ${paths.filter((p) => !suggestionPlaceOf(p)).map((p) => `"${p}"`).join(', ')}.`,
			'A place is step.<step>.description or step.<step>.<question>, as the reading names them.'
		),
		guard(new Set(paths).size !== paths.length, 'Name each place once.', 'One value per place: the whole text the place would hold.'),
		guard(writes.some((w) => w.value === ''), 'Each place of a suggestion needs its value.', 'An empty value offers nothing to accept.')
	);
}

/** Where the suggestion of a message stands. */
export function suggestionStateOf(message: Pick<FieldThreadMessage, 'suggests' | 'suggestion'>): 'none' | 'waiting' | SuggestionDecision['state'] {
	if (!message.suggests?.length) return 'none';
	return message.suggestion?.state ?? 'waiting';
}

/** Who may decide the suggestion of a message, and whether it still waits (actions 5e6110e2, b8b15449). */
export function canDecideSuggestion(actor: Actor, message: FieldThreadMessage | undefined, decision: 'accept' | 'refuse'): Guarded {
	const state = message ? suggestionStateOf(message) : 'none';
	return firstRefusal(
		guard(!message || state === 'none', 'This message suggests nothing.', 'Accept and Refuse decide the texts an AI message offers.'),
		guard(
			actor.kind === 'ai_client',
			`A suggestion is ${decision === 'accept' ? 'accepted' : 'refused'} by a person: the AI never decides its own.`,
			'The person reads what it offers and decides it on the page.'
		),
		guard(actor.role === 'viewer', 'A viewer reads and comments, but does not write.', 'Accepting a suggestion writes on the request.'),
		guard(state === 'accepted' || state === 'refused', 'This suggestion is already decided.', 'A suggestion is decided once; what it wrote keeps its versions.')
	);
}

/** The thread with the suggestion of that message decided. */
export function decideSuggestion(thread: FieldThread, messageId: string, decision: SuggestionDecision): FieldThread {
	return { ...thread, messages: thread.messages.map((m) => (m.id === messageId ? { ...m, suggestion: decision } : m)) };
}

/** Stable identity belongs to the place and requirement, not a retried comment ID. */
export const requirementKey = (fieldPath: string, line: string): string => JSON.stringify([fieldPath, line.trim()]);

export interface RequirementCandidate {
	readonly key: string;
	readonly messageId: string;
	readonly fieldPath: string;
	readonly line: string;
	readonly author: string;
	readonly state: 'waiting' | 'accepted' | 'refused';
	readonly by?: string;
}

/** Existing bundles and new suggestions share one individually decidable reading (757c9f25). */
export function requirementCandidates(messages: readonly FieldThreadMessage[]): RequirementCandidate[] {
	const candidates = new Map<string, RequirementCandidate>();
	for (const message of messages) for (const write of message.suggests ?? []) {
		for (const line of pointsOf(write.value)) {
			const key = requirementKey(write.fieldPath, line);
			const decision = message.requirementDecisions?.find((d) => requirementKey(d.fieldPath, d.line) === key) ?? message.suggestion;
			const existing = candidates.get(key);
			if (existing?.state !== undefined && existing.state !== 'waiting') continue;
			if (existing && !decision) continue;
			candidates.set(key, { key, messageId: message.id, fieldPath: write.fieldPath, line, author: message.author, state: decision?.state ?? 'waiting', ...(decision ? { by: decision.by } : {}) });
		}
	}
	return [...candidates.values()];
}
