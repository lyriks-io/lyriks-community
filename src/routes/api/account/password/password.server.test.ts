import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AuditEvent } from '$application/ports';
import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIdentity } from '$lib/server/identity.fixture';

/**
 * Changing one's own password, over an in-memory identity source that, like
 * the real ones, ends every session the old password opened.
 */

const ADA = 'ada@example.test';

function change(body: unknown, opts: { multiUser?: boolean; authRequired?: boolean; token?: string } = {}) {
	const identity = memoryIdentity([{ email: ADA, password: 'old-password-1' }], { multiUser: opts.multiUser ?? true });
	const token = opts.token ?? identity.sessionFor(ADA);
	const audit: AuditEvent[] = [];
	const event = requestEvent({
		path: '/api/account/password',
		method: 'POST',
		body: JSON.stringify(body),
		authRequired: opts.authRequired ?? true,
		session: { isAuthenticated: true, email: ADA },
		cookies: { lyriks_session: token },
		services: servicesWith({ identity, audit: { record: (e) => void audit.push(e) } })
	});
	const outcome = Promise.resolve(POST(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
	return { outcome, identity, token, event, audit };
}

describe('changing one own password', () => {
	it.each([
		['Enterprise', true],
		['Community', false]
	])('signs this browser in again with the new password on %s, and the old session no longer opens [rule:e418ed67]', async (_edition, multiUser) => {
		const { outcome, identity, token, event } = change({ currentPassword: 'old-password-1', newPassword: 'new-password-12' }, { multiUser });
		expect(await outcome).toEqual({ status: 200, body: { ok: true } });
		expect(await identity.verify(token)).toBeNull();
		const [cookie] = event.cookies.sets;
		expect(cookie.name).toBe('lyriks_session');
		expect(await identity.verify(cookie.value)).toMatchObject({ email: ADA });
		expect(await identity.login(ADA, 'new-password-12')).toHaveProperty('token');
		expect(await identity.login(ADA, 'old-password-1')).toHaveProperty('error');
	});

	it('refuses a wrong current password with 401, changing nothing and auditing the failure', async () => {
		const { outcome, identity, token, event, audit } = change({ currentPassword: 'guess', newPassword: 'new-password-12' });
		expect((await outcome).status).toBe(401);
		expect(await identity.verify(token)).toMatchObject({ email: ADA });
		expect(event.cookies.sets).toEqual([]);
		expect(audit).toMatchObject([{ action: 'account.password.change', outcome: 'failure' }]);
	});

	it('passes the source refusal of a too short password on as 422', async () => {
		const { outcome } = change({ currentPassword: 'old-password-1', newPassword: 'short' });
		expect(await outcome).toMatchObject({ status: 422, body: { message: 'Choose a password of at least 12 characters.' } });
	});

	it('refuses a confirmation that differs, changing nothing [rule:8f7bbfea]', async () => {
		const { outcome, identity, token } = change({
			currentPassword: 'old-password-1',
			newPassword: 'new-password-12',
			confirmPassword: 'new-pasword-12'
		});
		expect(await outcome).toMatchObject({ status: 400, body: { message: 'The two passwords do not match.' } });
		expect(await identity.verify(token)).toMatchObject({ email: ADA });
		expect(await identity.login(ADA, 'old-password-1')).toHaveProperty('token');
	});

	it('asks for both passwords before asking the identity source', async () => {
		const { outcome, identity, token } = change({ newPassword: 'new-password-12' });
		expect((await outcome).status).toBe(422);
		expect(await identity.verify(token)).toMatchObject({ email: ADA });
	});

	it('is not offered where password sign-in is off', async () => {
		expect((await change({ currentPassword: 'old-password-1', newPassword: 'new-password-12' }, { authRequired: false }).outcome).status).toBe(404);
	});
});
