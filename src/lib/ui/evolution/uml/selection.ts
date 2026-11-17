/** What is selected on the functional diagram, by name or position in the diagram it was picked on. */
export type DiagramSelection =
	| { readonly kind: 'actor'; readonly name: string }
	| { readonly kind: 'use_case'; readonly name: string }
	| { readonly kind: 'step'; readonly useCase: string; readonly index: number }
	| { readonly kind: 'machine'; readonly object: string }
	| { readonly kind: 'state'; readonly object: string; readonly name: string }
	| { readonly kind: 'transition'; readonly object: string; readonly index: number };

export type DiagramView = 'use_cases' | 'flows' | 'states';

/** What is selected on the Technical spec's diagram. */
export type TechSelection =
	| { readonly kind: 'element'; readonly name: string }
	| { readonly kind: 'link'; readonly index: number }
	| { readonly kind: 'note'; readonly index: number }
	| { readonly kind: 'sequence'; readonly name: string }
	| { readonly kind: 'message'; readonly sequence: string; readonly index: number };

export type TechView = 'components' | 'sequences';

/** Whether `selection` is the element `candidate` names: what the drawing outlines. */
export function isSelected<S extends { readonly kind: string }>(selection: S | null, candidate: S): boolean {
	if (!selection || selection.kind !== candidate.kind) return false;
	return JSON.stringify(selection).toLowerCase() === JSON.stringify(candidate).toLowerCase();
}

/** Whether `candidate` is one of the elements the drawing marks for a problem (ac-evo-func-uml-text). */
export function isMarked<C extends { readonly kind: string }>(marks: readonly { readonly kind: string }[], candidate: C): boolean {
	return marks.some((mark) => isSelected(mark, candidate));
}

/** Enter or Space on a focused element of the drawing picks it, like a click. */
export const onPickKey = (pick: () => void) => (event: KeyboardEvent) => {
	if (event.key !== 'Enter' && event.key !== ' ') return;
	event.preventDefault();
	pick();
};
