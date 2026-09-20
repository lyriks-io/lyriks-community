/**
 * The first steps: what to do once Lyriks runs. They live on get.lyriks.io,
 * beside the install guide, not in the installation, so they can be corrected
 * and screen-captured without shipping a release; the user menu carries one
 * link to them, before Documentation, opened in a new tab.
 *
 * The link carries this installation's origin as a URL FRAGMENT. A fragment
 * never leaves the browser: get.lyriks.io does not see the address of a
 * customer's installation and cannot log it. The guide's own script reads it
 * to point its shortcuts (the portfolio, Settings, the activation page) back
 * at this installation and to print the real MCP address instead of a
 * pattern. Without a usable origin (a server render, an odd value) the link
 * is the bare guide, which reads fine on its own.
 */
export const FIRST_STEPS_URL = 'https://get.lyriks.io/first-steps';

export function firstStepsUrlFor(origin?: string | null): string {
	const clean = (origin ?? '').trim().replace(/\/+$/, '');
	if (!/^https?:\/\/[^/?#\s]+$/i.test(clean)) return FIRST_STEPS_URL;
	return `${FIRST_STEPS_URL}#app=${encodeURIComponent(clean)}`;
}
