import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { LYRIKS_ALLOW_SIGNUP: '1' } }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { actions } from './+page.server';

type RegisterEvent = Parameters<NonNullable<typeof actions.register>>[0];

/** A sign-up posted on an installation where the operator allowed sign-up. */
function signUp(opts: { authRequired: boolean; licenseRequired: boolean; unclaimed: boolean }) {
	const register = vi.fn().mockResolvedValue({ token: 'session' });
	const form = new FormData();
	form.set('email', 'eve@example.com');
	form.set('password', 'long-enough-password');
	form.set('confirm', 'long-enough-password');
	const event = {
		request: new Request('http://platform/login?/register', { method: 'POST', body: form }),
		cookies: { set: vi.fn() },
		getClientAddress: () => `10.0.0.${Math.floor(Math.random() * 250)}`,
		url: new URL('http://platform/login'),
		locals: {
			authRequired: opts.authRequired,
			services: {
				licenseRequired: () => opts.licenseRequired,
				installEdition: () => 'enterprise',
				enterpriseHooks: null,
				audit: { record: vi.fn() },
				identity: {
					multiUser: true,
					installUnclaimed: vi.fn().mockResolvedValue(opts.unclaimed),
					registrationOpen: vi.fn().mockResolvedValue(opts.unclaimed),
					register
				}
			}
		}
	} as unknown as RegisterEvent;
	return { event, register };
}

describe('the register action of the sign-in page', () => {
	it('refuses sign-up while the installation waits for its claim [rule:acb2efea]', async () => {
		const { event, register } = signUp({ authRequired: true, licenseRequired: true, unclaimed: true });
		const result = (await actions.register!(event)) as { status: number; data: { message: string } };
		expect(result.status).toBe(403);
		expect(result.data.message).toBe('This installation is not claimed yet. Claim it with its licence key first.');
		expect(register).not.toHaveBeenCalled();
	});

	it('lets the first person sign up where no claim is awaited', async () => {
		const { event, register } = signUp({ authRequired: true, licenseRequired: false, unclaimed: true });
		await expect(actions.register!(event)).rejects.toMatchObject({ status: 303 });
		expect(register).toHaveBeenCalledTimes(1);
	});
});
