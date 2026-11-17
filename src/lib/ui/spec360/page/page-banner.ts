import { getContext, setContext, type Snippet } from 'svelte';

/**
 * What the Specification 360° shows under every page's head, above its
 * content: the validation still owed (or, once validated, the code changed
 * outside Lyriks) and the list of discussions when it was asked for. The
 * layout owns it; the page's head renders it, so it never sits above the
 * head.
 */
const KEY = Symbol('spec-page-banner');

export function providePageBanner(banner: () => Snippet | undefined): void {
	setContext(KEY, banner);
}

export function usePageBanner(): Snippet | undefined {
	return getContext<(() => Snippet | undefined) | undefined>(KEY)?.();
}
