import { ORIGIN_ANSWER_KEYS, personKey } from '$domain/evolution';
import { patchKey, type Patch } from './dossier-overlay';
import type { PendingVerdict } from './optimistic-verdict';

/** An answer a section holds, as its Validate reads it. */
export interface HeldAnswer {
	readonly path: string;
	readonly leafId: string | null;
	readonly filled: boolean;
	readonly trail?: {
		readonly validation?: string;
		readonly validatedBy?: readonly string[];
	} | null;
}

/** A step validated as a whole along with the answers of a section (the Functional and the Technical spec). */
export interface HeldStep {
	readonly step: string;
	readonly validatedBy: readonly string[];
	readonly validated: boolean;
}

/** What one act on a section sends, and what it reads at once on the page. */
export interface SectionAct {
	readonly operations: Record<string, unknown>[];
	readonly patches: Record<string, Patch>;
}

const has = (list: readonly string[], id: string) => list.some((x) => personKey(x) === personKey(id));
const validatorsOf = (a: HeldAnswer) => (a.trail?.validation === 'refused' ? [] : (a.trail?.validatedBy ?? []));
const targetOf = (a: HeldAnswer) => ({ fieldPath: a.path, ...(a.leafId ? { leafId: a.leafId } : {}) });

/** Where the reader stands on a section: behind all of it, everyone it waits on behind all of it, and whether it waits on the reader. */
export function sectionStanding(answers: readonly HeldAnswer[], steps: readonly HeldStep[], actor: string) {
	const filled = answers.filter((a) => a.filled);
	const mine = filled.length > 0 && filled.every((a) => has(validatorsOf(a), actor)) && steps.every((s) => has(s.validatedBy, actor));
	const settled = filled.length > 0 && filled.every((a) => a.trail?.validation === 'validated') && steps.every((s) => s.validated);
	return { mine, settled, waits: filled.length > 0 && !mine && !settled };
}

const verdict = (act: PendingVerdict): Patch => ({ kind: 'verdict', verdict: act });

/** Validate on a section: every written answer the reader is not behind yet, and the step it stands for. */
export function sectionValidation(answers: readonly HeldAnswer[], steps: readonly HeldStep[], actor: string): SectionAct {
	const waiting = answers.filter((a) => a.filled && !has(validatorsOf(a), actor));
	const stepsWaiting = steps.filter((s) => !has(s.validatedBy, actor));
	return {
		operations: [...waiting.map((a) => ({ op: 'validate_field', ...targetOf(a) })), ...stepsWaiting.map((s) => ({ op: 'validate_step', step: s.step }))],
		patches: Object.fromEntries([
			...waiting.map((a) => [patchKey.verdict(a.path, a.leafId), verdict({ act: 'validate' })] as const),
			...stepsWaiting.map((s) => [patchKey.step(s.step), verdict({ act: 'validate' })] as const)
		])
	};
}

/** Taking one's validation of a section back: off every answer and step the reader stands behind. */
export function sectionWithdrawal(answers: readonly HeldAnswer[], steps: readonly HeldStep[], actor: string): SectionAct {
	const given = answers.filter((a) => a.filled && has(validatorsOf(a), actor));
	const stepsGiven = steps.filter((s) => has(s.validatedBy, actor));
	return {
		operations: [
			...given.map((a) => ({ op: 'withdraw_field_verdict', ...targetOf(a) })),
			...stepsGiven.map((s) => ({ op: 'withdraw_step_validation', step: s.step }))
		],
		patches: Object.fromEntries([
			...given.map((a) => [patchKey.verdict(a.path, a.leafId), verdict({ act: 'withdraw' })] as const),
			...stepsGiven.map((s) => [patchKey.step(s.step), verdict({ act: 'withdraw' })] as const)
		])
	};
}

/** Several acts sent as one save ("Validate all" of a step): their operations in order, their patches together. */
export function mergeActs(acts: readonly SectionAct[]): SectionAct {
	return { operations: acts.flatMap((a) => a.operations), patches: Object.assign({}, ...acts.map((a) => a.patches)) };
}

/** A suggestion of the AI waiting on an answer, as Validate all reads it. */
export interface HeldSuggestion {
	readonly id: string;
	readonly targetField: string;
	readonly value: string;
	readonly decision?: string;
	readonly acceptable?: { readonly ok: boolean };
	readonly ask?: unknown;
}

/**
 * Whether Validate all takes a suggestion as it stands (ac-evo-form-validate-each):
 * still waiting, acceptable as it is, and asking the person nothing.
 */
export const takenByValidateAll = (s: HeldSuggestion): boolean => (s.decision ?? 'pending') === 'pending' && s.acceptable?.ok !== false && !s.ask;

/** What accepting a suggestion writes on the page at once: who asked and where it comes from are the request's, the rest an answer's text. */
function writtenBy(s: HeldSuggestion): Record<string, Patch> {
	if (s.targetField === ORIGIN_ANSWER_KEYS.requester) return { [patchKey.request]: { kind: 'request', requester: s.value } };
	if (s.targetField === ORIGIN_ANSWER_KEYS.origin) return { [patchKey.request]: { kind: 'request', origin: s.value } };
	return { [patchKey.text(s.targetField, null)]: { kind: 'text', value: s.value } };
}

/**
 * Validate all on the suggestions a section holds (ac-evo-form-validate-each):
 * each one accepted as it stands, then the answer it wrote validated in the
 * reader's name, as Accept then Validate would. A suggestion Validate all does
 * not take is left out.
 */
export function suggestionValidation(suggestions: readonly HeldSuggestion[]): SectionAct {
	const taken = suggestions.filter(takenByValidateAll);
	return {
		operations: taken.flatMap((s) => [
			{ op: 'decide_proposal', proposalId: s.id, decision: 'accept' },
			{ op: 'validate_field', fieldPath: s.targetField }
		]),
		patches: Object.assign(
			{},
			...taken.map((s) => ({
				[patchKey.proposal(s.id)]: { kind: 'decided' } as Patch,
				...writtenBy(s),
				[patchKey.verdict(s.targetField, null)]: verdict({ act: 'validate' })
			}))
		)
	};
}

