/**
 * Where a successful sign-in sends the person.
 *
 * Pure: takes the requested target, returns a destination. No environment, no
 * request, so the refusals below can actually be tested, which for a redirect
 * rule is the whole point.
 */

/**
 * A local path, or "/".
 *
 * Local paths must start with a single "/": "//evil.example" is a protocol
 * relative URL that browsers happily follow off-site, so it is rejected. No
 * other origin is ever honoured: the behaviour engine's editor, the one page
 * that used to send people here from another port, is launched on the host
 * now and has no way back to give (feat-154, criterion ea8894f2).
 */
export function postLoginRedirect(target: string): string {
	if (/[\\\x00-\x20\x7f]/.test(target)) return '/';
	if (target.startsWith('/') && !target.startsWith('//')) {
		const base = 'https://local.invalid';
		try {
			if (new URL(target, base).origin === base) return target;
		} catch { /* malformed destination */ }
	}
	return '/';
}
