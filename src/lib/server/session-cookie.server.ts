import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'lyriks_session';

// Matches the lifetime of the back's JWT the cookie carries.
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * The session cookie is host-only by default: browsers scope cookies by host
 * while ignoring the port, so the behavior dashboard on the app's host at
 * another PORT receives the session with no configuration at all.
 *
 * LYRIKS_COOKIE_DOMAIN exists for the one layout where that is impossible: an
 * ingress that can only route by hostname (e.g. a Cloudflare Tunnel, which
 * cannot publish extra public ports). There the dashboard lives on a CHILD
 * subdomain of the app's host, and the cookie must be widened to that host for
 * the browser to send it there. The appliance installer sets the variable for
 * exactly that layout and clears it everywhere else; unset means host-only,
 * which is the correct default for every other deployment.
 */
const cookieDomain = (): string | undefined => {
	const domain = (env.LYRIKS_COOKIE_DOMAIN ?? '').trim();
	return domain.length > 0 ? domain : undefined;
};

export function setSessionCookie(cookies: Cookies, token: string): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_MAX_AGE,
		domain: cookieDomain()
	});
}

/**
 * Sessions issued before LYRIKS_COOKIE_DOMAIN was configured are host-only, so
 * they would never reach the dashboard's subdomain until they expire: up to a
 * week of "not signed in" panels right after the operator flips the layout.
 * Re-issuing the cookie with the configured domain on each authenticated
 * request upgrades those sessions transparently. The host-only twin may linger
 * alongside until logout, but it carries the same token, so nothing diverges.
 * No-op while the variable is unset.
 */
export function refreshSessionCookieDomain(cookies: Cookies, token: string): void {
	if (!cookieDomain()) return;
	setSessionCookie(cookies, token);
}

/**
 * Delete BOTH variants the browser may hold. Which one a user carries depends
 * on when their session was issued relative to a LYRIKS_COOKIE_DOMAIN change,
 * and a deletion only matches a cookie with the same Domain attribute, so
 * clearing just one variant would leave the other one signed in.
 */
export function deleteSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	const domain = cookieDomain();
	if (domain) cookies.delete(SESSION_COOKIE, { path: '/', domain });
}
