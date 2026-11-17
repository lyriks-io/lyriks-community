/**
 * The key the project layout mounts its page under. A new key fades a whole new
 * page in; the same key keeps what is on screen and lets the page change only
 * what differs. The pages of the Specification 360° share one frame (the
 * product's title, the validation card, the chapter nav, the feature tree), so
 * moving from one to another keeps that frame and swaps the content alone.
 */
export function pageKey(pathname: string): string {
	const spec = /^(\/projects\/[^/]+\/spec)(?:\/|$)/.exec(pathname);
	return spec ? spec[1] : pathname;
}
