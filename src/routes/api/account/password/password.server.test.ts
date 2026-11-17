import { describe, expect, it, vi } from 'vitest';

import { POST } from './+server';

type Event = Parameters<typeof POST>[0];

/** A signed-in request on an installation of either edition. */
function request(multiUser: boolean) {
	const identity = {
		multiUser,
		changePassword: vi.fn().mockResolvedValue(undefined),
		login: vi.fn().mockResolvedValue({ token: 'new-session' })
	};
	const set = vi.fn();
	const event = {
		locals: {
			authRequired: true,
			session: { email: 'member@example.test' },
			services: { identity, audit: { record: vi.fn() } }
		},
		cookies: { get: () => 'old-session', set },
		request: new Request('http://platform/api/account/password', {
			method: 'POST',
			body: JSON.stringify({ currentPassword: 'old-password-1', newPassword: 'new-password-12' })
		})
	} as unknown as Event;
	return { event, identity, set };
}

describe('POST /api/account/password', () => {
	it.each([
		['Enterprise', true],
		['Community', false]
	])('signs this browser in again with the new password on %s [rule:e418ed67]', async (_edition, multiUser) => {
		const { event, identity, set } = request(multiUser);
		const res = await POST(event);
		expect(res.status).toBe(200);
		expect(identity.changePassword).toHaveBeenCalledWith('old-session', 'old-password-1', 'new-password-12');
		expect(identity.login).toHaveBeenCalledWith('member@example.test', 'new-password-12');
		expect(set).toHaveBeenCalledWith('lyriks_session', 'new-session', expect.anything());
	});
});
