import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { IdentityError } from '$application/ports';
import { SESSION_COOKIE, setSessionCookie } from '$lib/server/session-cookie.server';
import type { RequestHandler } from './$types';

/**
 * Change the signed-in account's password.
 *
 * Available whenever password sign-in is real (LYRIKS_AUTH_REQUIRED=1), for
 * every edition: the credential lives in lyriks-back, which verifies the
 * current password before replacing it, and Community's single operator seat
 * is such an account since the kit made --admin-email mandatory. The
 * installer prints a temporary password and tells the operator to change it
 * on first login, so without this the very first instruction an appliance
 * gives could not be carried out.
 */
export const POST: RequestHandler = async (event) => {
	const services = getServices();
	if (!event.locals.authRequired) {
		error(404, 'Password sign-in is not enabled on this install.');
	}

	const body = (await event.request.json().catch(() => ({}))) as {
		currentPassword?: string;
		newPassword?: string;
	};
	if (!body.currentPassword || !body.newPassword) {
		error(422, 'Both the current and the new password are required.');
	}

	try {
		await services.identity.changePassword(
			event.cookies.get(SESSION_COOKIE) ?? '',
			body.currentPassword,
			body.newPassword
		);
	} catch (e) {
		// Surface the back's own refusal — "wrong current password" and "too
		// short" are things the person typing can act on, and collapsing them
		// into one generic failure is what makes a password form unusable.
		const status = e instanceof IdentityError ? e.status : ((e as { status?: number }).status ?? 502);
		const message = (e as { message?: string }).message ?? 'Could not change the password.';
		services.audit.record({
			action: 'account.password.change',
			actor: event.locals.session?.email ?? 'anonymous',
			outcome: 'failure',
			detail: `status=${status}`
		});
		error(status === 401 ? 401 : status === 422 ? 422 : 502, message);
	}

	services.audit.record({
		action: 'account.password.change',
		actor: event.locals.session?.email ?? 'anonymous',
		outcome: 'success',
		detail: 'self-service'
	});
	if (!services.identity.multiUser && event.locals.session?.email) {
		const login = await services.identity.login(event.locals.session.email, body.newPassword);
		if ('token' in login) setSessionCookie(event.cookies, login.token);
	}
	// Never echo any part of a credential exchange back to the client.
	return json({ ok: true });
};
