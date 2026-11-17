import { createHash } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { SESSION_COOKIE } from './session-cookie.server';

/** A non-authorizing boundary: a new sign-in cannot inherit old navigation metadata. */
export function navigationSessionBoundary(cookies: Pick<Cookies, 'get'>): string | null {
	const token = cookies.get(SESSION_COOKIE);
	return token ? createHash('sha256').update(token).digest('hex') : null;
}
