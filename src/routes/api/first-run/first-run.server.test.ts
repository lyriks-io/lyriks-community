import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIdentity } from '$lib/server/identity.fixture';

/** Whether the installation still waits for its first operator, as the installer asks it. */
async function unclaimed(opts: { authRequired: boolean; licenseRequired: boolean; accounts: string[] }) {
	const identity = memoryIdentity(opts.accounts.map((email) => ({ email })));
	const services = servicesWith({ identity, licenseRequired: () => opts.licenseRequired });
	const response = await Promise.resolve(GET(requestEvent({ path: '/api/first-run', authRequired: opts.authRequired, services })));
	return (await response.json()).unclaimed;
}

describe('the first-run question', () => {
	it('is yes only with sign-in on, a licence required and no account yet', async () => {
		expect(await unclaimed({ authRequired: true, licenseRequired: true, accounts: [] })).toBe(true);
	});

	it('is no once an account exists, with sign-in off, or without a licence to claim it with', async () => {
		expect(await unclaimed({ authRequired: true, licenseRequired: true, accounts: ['holder@example.test'] })).toBe(false);
		expect(await unclaimed({ authRequired: false, licenseRequired: true, accounts: [] })).toBe(false);
		expect(await unclaimed({ authRequired: true, licenseRequired: false, accounts: [] })).toBe(false);
	});
});
