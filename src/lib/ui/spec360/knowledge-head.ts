import { getContext, setContext } from 'svelte';

/**
 * Whether the three rows at the top of Knowledge (the product's name, the tab
 * bar, the band) stand above the page and stay in view (criterion 8e942b12):
 * a page's own head then scrolls with its content instead of sticking.
 */
const KEY = Symbol('knowledge-head');

export function provideKnowledgeHead(shown: () => boolean): void {
	setContext(KEY, shown);
}

/** Read while the component initialises; the answer follows the page. */
export function knowledgeHeadAbove(): () => boolean {
	return getContext<(() => boolean) | undefined>(KEY) ?? (() => false);
}
