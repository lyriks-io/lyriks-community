import { SPEC_BLOCKS, canonicalPathsFor, fieldKey, type BlockField, type SpecBlock } from './blocks';
import type { FilledFields } from './maturity';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * Fill the gaps: the guided walk over the fields still empty or marked as open
 * questions, one question per screen, in block order.
 *
 * It is a second reading of the same page, never a wizard: the mode opens on
 * what is pending, saves an answer the way a field on the page is saved, and
 * can be left at any moment without losing anything. A filled field is never
 * shown, which is the whole difference between beating the blank page and
 * re-reading a form.
 */

/** One screen of the walk: a home of a field that is empty or an open question. */
export interface PendingField {
	readonly field: BlockField;
	readonly block: SpecBlock;
	/** The feature this home belongs to; null for a project-wide field. */
	readonly leafId: string | null;
	/** The presence key, as `fieldKey` builds it. */
	readonly key: string;
	/** True when the author declared this home an open question. */
	readonly openQuestion: boolean;
}

/**
 * The fields the walk asks about, in block order and per home. A leaf-scoped
 * field with no leaf named has no home and is not walked: its hole is "name
 * what this touches", which the page says in its own words.
 */
export function pendingFields(
	filled: FilledFields,
	openQuestionKeys: readonly string[],
	leafIds: readonly string[],
	blocks: readonly SpecBlock[] = SPEC_BLOCKS
): PendingField[] {
	const open = new Set(openQuestionKeys);
	const pending: PendingField[] = [];
	for (const block of blocks) {
		for (const field of block.fields) {
			for (const home of canonicalPathsFor(field, leafIds)) {
				const key = fieldKey(field.path, home.leafId);
				const openQuestion = open.has(key);
				if (openQuestion || !filled.has(key)) {
					pending.push({ field, block, leafId: home.leafId, key, openQuestion });
				}
			}
		}
	}
	return pending;
}

/**
 * What the model is asked to complete, in order: the open questions first,
 * because an amber field is exactly what the author declared they could not
 * answer, then the fields left empty. Each answer arrives as a proposal to
 * sign, never as a value.
 */
export function completionTargets(
	filled: FilledFields,
	openQuestionKeys: readonly string[],
	leafIds: readonly string[],
	blocks: readonly SpecBlock[] = SPEC_BLOCKS
): PendingField[] {
	const pending = pendingFields(filled, openQuestionKeys, leafIds, blocks);
	return [...pending.filter((p) => p.openQuestion), ...pending.filter((p) => !p.openQuestion)];
}

/** The mode opens only for a writer, and only when something is left to ask. */
export function canOpenGuidedFill(input: { canEdit: boolean; pendingCount: number }): Guarded {
	return firstRefusal(
		guard(
			!input.canEdit,
			'You can read this request but not write on it.',
			'A reader without write access cannot open a mode whose only purpose is to write.'
		),
		guard(
			input.pendingCount <= 0,
			'Nothing is left to ask: every field is filled. The next stage is waiting.',
			'With no pending field the mode has nothing to show; it says so and points at the next stage rather than at an export.'
		)
	);
}

/** An answer can only be given inside the mode. */
export function canAnswerInGuidedFill(active: boolean): Guarded {
	return guard(!active, 'Fill the gaps is not open.', 'An answer can only be given inside the mode.');
}

/** Stepping back is only possible past the first question, inside the mode. */
export function canStepBack(input: { active: boolean; stepIndex: number }): Guarded {
	return firstRefusal(
		guard(
			!input.active,
			'Fill the gaps is not open.',
			'The walk can only move inside the mode.'
		),
		guard(
			input.stepIndex <= 0,
			'You are on the first question.',
			'There is no earlier question to go back to.'
		)
	);
}

/** There is no mode to leave when none is open. */
export function canLeaveGuidedFill(active: boolean): Guarded {
	return guard(!active, 'Fill the gaps is not open.', 'There is no mode to leave.');
}
