import { isOwedBeforeImpact, owesAnswer } from '$domain/evolution';

/** One text of the Solution tab, or a step's diagram, and whether it holds anything. */
export interface SolutionPart {
	readonly step: string;
	readonly key: string;
	readonly filled: boolean;
}

/**
 * What a section of the Solution tab offers and nobody wrote yet, as the tab
 * names it (EVO-013, criterion 0a4d6036): the Solution's examples by the kind
 * their lines carry, the Functional spec and the Technical spec as wholes, a
 * drawn diagram counting as written. Read Optional, never owed.
 */
export function optionalUnwritten(parts: readonly SolutionPart[], exampleKind: string): string[] {
	const on = (step: string) => parts.filter((p) => p.step === step);
	const unwritten = (step: string) => on(step).length > 0 && on(step).every((p) => !p.filled);
	const examples = parts.find((p) => p.step === 'solution' && p.key === 'examples');
	return [
		...(examples && !examples.filled ? [exampleKind] : []),
		...(unwritten('functional_spec') ? ['Functional spec'] : []),
		...(unwritten('technical_spec') ? ['Technical spec'] : [])
	];
}

type OwingField = Parameters<typeof owesAnswer>[0] & { readonly path: string };

/**
 * The section the tab opens in edit mode by itself (criteria aee67920, 189c4d88):
 * the first one still owing a text the request owes, which on the Solution tab
 * is its description alone. What the tab offers opens no editor by itself
 * (EVO-013, criterion 0a4d6036).
 */
export function firstOwingSection<S extends { readonly id: string; readonly questions: readonly { readonly field: OwingField }[] }>(sections: readonly S[]): S | null {
	return sections.find((s) => s.questions.some((q) => isOwedBeforeImpact(q.field.path) && owesAnswer(q.field))) ?? null;
}
