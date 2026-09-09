/**
 * Where a successful sign-in sends the operator.
 *
 * Pure: takes the requested target and the deployment's configured dashboard
 * URL, returns a destination. No environment, no request — so the refusals below
 * can actually be tested, which for a redirect rule is the whole point.
 */

/**
 * A local path, or the configured behaviour-dashboard origin, or "/".
 *
 * Local paths must start with a single "/" — "//evil.example" is a protocol
 * relative URL that browsers happily follow off-site, so it is rejected.
 *
 * The dashboard is the one external destination ever honoured. It has no login
 * of its own: it verifies this app's session and, finding none, sends the
 * operator here. Without a way back they arrive at the app root having lost the
 * page they were on — and for a link followed out of a feature, that means
 * hunting for the feature again. The origin comes from the deployment's own
 * configuration and is matched exactly, so a request can never nominate it.
 */
export function postLoginRedirect(target: string, dashboardUrl?: string | null): string {
	if (/[\\\x00-\x20\x7f]/.test(target)) return '/';
	if (target.startsWith('/') && !target.startsWith('//')) {
		const base = 'https://local.invalid';
		try {
			if (new URL(target, base).origin === base) return target;
		} catch { /* malformed destination */ }
		return '/';
	}

	const origin = dashboardOrigin(dashboardUrl);
	if (origin) {
		try {
			// Exact origin: scheme, host AND port. The dashboard sits on the app's
			// host under a different port, so a host-only comparison would accept
			// any port on that machine — including whatever else happens to be
			// listening on it.
			if (new URL(target).origin === origin) return target;
		} catch {
			/* not a URL at all */
		}
	}
	return '/';
}

function dashboardOrigin(configured?: string | null): string | null {
	const value = (configured ?? '').trim();
	if (!value) return null;
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}
