import { prefillable, type StepPrefillSection } from '$domain/evolution';

/** An answer a section holds, as far as prefilling it goes. */
export interface PrefillAnswer {
	readonly path: string;
	readonly leafId: string | null;
	readonly filled: boolean;
	readonly trail?: { readonly validation?: string } | null;
}

export interface PrefillTarget {
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly section: readonly string[];
}

/**
 * The click a section's Prefill sends (ac-evo-live-prefill): it bears on the
 * first question left empty and covers every question of the section; null
 * when the section holds nothing to prefill.
 */
export function prefillTargetOf(answers: readonly PrefillAnswer[]): PrefillTarget | null {
	const questions = answers.filter((a) => prefillable(a.path));
	const target = questions.find((a) => !a.filled) ?? questions[0];
	return target ? { fieldPath: target.path, leafId: target.leafId, section: questions.map((a) => a.path) } : null;
}

/**
 * The section a prefill of the whole step walks (ac-evo-live-prefill-step): the
 * same click as the section's own Prefill, left out when every question it
 * holds to prefill is written and validated.
 */
export function stepPrefillSectionOf(id: string, answers: readonly PrefillAnswer[]): StepPrefillSection | null {
	const target = prefillTargetOf(answers);
	const settled = answers.filter((a) => prefillable(a.path)).every((a) => a.filled && a.trail?.validation === 'validated');
	return target && !settled ? { id, ...target } : null;
}
