import { PLACE_PARAM } from '$domain/evolution';

/**
 * Whether a navigation opens its page at the top. Pages scroll inside the
 * app's own scroll area, which neither the browser nor SvelteKit scrolls, so a
 * button that leads to another page (a "← Previous" / "Next →" at a page's
 * foot, a tab, another evolution) would otherwise open it where the last one
 * was left. Going back keeps the browser's place, and a link to a precise spot
 * (an anchor, an evolution's place) lands on that spot instead.
 */
export function landsAtTop(from: URL | null, to: URL, type: string): boolean {
	if (!from || type === 'popstate' || type === 'enter') return false;
	if (to.hash || to.searchParams.has(PLACE_PARAM)) return false;
	if (from.pathname !== to.pathname) return true;
	// The evolutions tab opens one request or another at the same address.
	return from.searchParams.get('request') !== to.searchParams.get('request');
}
