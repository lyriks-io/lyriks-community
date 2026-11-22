import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIdentity } from '$lib/server/identity.fixture';

/** Signing out ends the session at the identity source, not only in this browser. */
describe('signing out', () => {
	async function signOut(cookies: Record<string, string>, identity = memoryIdentity([{ email: 'ada@example.test' }])) {
		const event = requestEvent({ path: '/logout', method: 'POST', cookies, services: servicesWith({ identity }) });
		const thrown = await Promise.resolve(POST(event)).then(() => null, (e: unknown) => e);
		return { event, location: isRedirect(thrown) ? thrown.location : null };
	}

	it('revokes the session token, clears the cookie and returns to the sign-in page', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test' }]);
		const token = identity.sessionFor('ada@example.test');
		const other = identity.sessionFor('ada@example.test');
		const { event, location } = await signOut({ lyriks_session: token }, identity);
		expect(location).toBe('/login');
		expect(await identity.verify(token)).toBeNull();
		expect(await identity.verify(other)).toBeNull();
		expect(event.cookies.deletes.map((d) => d.name)).toEqual(['lyriks_session']);
		expect(event.cookies.get('lyriks_session')).toBeUndefined();
	});

	it('still clears the cookie and returns to sign in without a session', async () => {
		const { event, location } = await signOut({});
		expect(location).toBe('/login');
		expect(event.cookies.deletes.map((d) => d.name)).toEqual(['lyriks_session']);
	});
});
