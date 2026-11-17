import { getContext, setContext } from 'svelte';

/**
 * What a page of Knowledge is validated on, handed to the band at the top of
 * Knowledge, where its validation reads (criterion f480783f): the elements it
 * validates, the block the view moves on from once the reader validated
 * theirs, and what the band is named for a screen reader. A page that is not
 * validated on its own (Features, Users, the Glossary...) hands none, and the
 * band says where the whole specification stands.
 */
export interface PageScope {
	readonly anchors: readonly string[];
	readonly sectionId: string;
	readonly label: string;
	/** The path of the page that holds it: while the next page loads, the band never reads the page being left's (criterion c509fa9c). */
	readonly path?: string;
}

export class PageScopeSlot {
	scope = $state<PageScope | null>(null);

	/** The page on screen holds the band while it shows; the next page takes it over. */
	hold(scope: PageScope): () => void {
		this.scope = scope;
		return () => {
			if (this.scope === scope) this.scope = null;
		};
	}
}

const KEY = Symbol('spec-page-scope');

export function providePageScope(slot: PageScopeSlot): PageScopeSlot {
	setContext(KEY, slot);
	return slot;
}

/** Outside Knowledge nothing provides it. */
export function usePageScope(): PageScopeSlot | null {
	return getContext<PageScopeSlot | undefined>(KEY) ?? null;
}
