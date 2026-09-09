import { redirect, type RequestHandler } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { SESSION_COOKIE, deleteSessionCookie } from '$lib/server/session-cookie.server';

/** Clear the session cookie (both host-only and domain-wide variants) and bounce to /login. */
export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await getServices().identity.revokeSessions?.(token);
	deleteSessionCookie(cookies);
	redirect(303, '/login');
};
