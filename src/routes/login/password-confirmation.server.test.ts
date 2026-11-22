import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { EnterpriseHooks } from '$composition/enterprise-hooks';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { actions } from './+page.server';
import { requestEvent, servicesWith, type FakeServices, type TestEvent } from '$lib/server/request-event.fixture';
import { memoryIdentity } from '$lib/server/identity.fixture';
import { LocalIdentityProvider, type QueryFn } from '$lib/infrastructure/auth/local-identity-provider.server';

/**
 * Create your Lyriks account asks the password twice: the register action of
 * the sign-in page compares the two before the account store is asked, and a
 * refusal hands back what the person typed except the passwords.
 */

type ActionEvent = Parameters<NonNullable<typeof actions.register>>[0];

let ip = 0;
function post(path: string, fields: Record<string, string>, services: FakeServices): ActionEvent {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	const event: TestEvent = requestEvent({ path, method: 'POST', body: form, authRequired: true, services: servicesWith(services) });
	const address = `10.7.${Math.floor(++ip / 250)}.${ip % 250}`;
	event.getClientAddress = () => address;
	return event as ActionEvent;
}

async function run(event: ActionEvent) {
	try {
		const result: unknown = await actions.register!(event);
		if (isActionFailure(result)) return { failure: result.status, data: result.data as unknown as Record<string, unknown> };
		return { data: (result ?? {}) as Record<string, unknown> };
	} catch (thrown) {
		if (isRedirect(thrown)) return { redirect: thrown.location };
		throw thrown;
	}
}

/** One open invitation for `invitee`, read back from the identity source like the real hooks. */
function invitationFor(invitee: string): EnterpriseHooks {
	return {
		callerReach: async () => null,
		invitationBehind: async (redirectTo) =>
			redirectTo.startsWith('/join/') ? { token: 'inv-1', invitation: { email: invitee, workspaceName: 'Acme' } } : { token: null, invitation: null },
		settingsMembers: async () => null,
		settingsReclaim: async () => null
	};
}

/** An Enterprise installation that already has its first account, over an in-memory account store. */
function teamInstallation(hooks: EnterpriseHooks | null = null) {
	const identity = memoryIdentity([{ email: 'root@example.test' }]);
	const register = vi.spyOn(identity, 'register');
	const services: FakeServices = {
		identity,
		installEdition: () => 'enterprise',
		licenseRequired: () => false,
		enterpriseHooks: hooks,
		audit: { record: () => undefined }
	};
	return { identity, register, services };
}

/** The Community account store (the operator_accounts table held in memory), behind the real adapter. */
function communityStore() {
	const rows: Array<{ email: string }> = [];
	const query = (async (sql: string, params: readonly unknown[] = []) => {
		if (sql.startsWith('SELECT count')) return { rows: [{ n: rows.length }] };
		if (sql.startsWith('INSERT')) {
			rows.push({ email: String(params[0]) });
			return { rows: [{ id: `acc-${rows.length}` }] };
		}
		throw new Error(`unexpected sql: ${sql}`);
	}) as QueryFn;
	const identity = new LocalIdentityProvider('a-shared-secret-long-enough-for-tests-0123456789', query);
	const services: FakeServices = {
		identity,
		installEdition: () => 'community',
		licenseRequired: () => false,
		enterpriseHooks: null,
		audit: { record: () => undefined }
	};
	return { rows, services };
}

afterEach(() => {
	for (const key of Object.keys(privateEnv)) delete privateEnv[key];
});

describe('Create your Lyriks account refuses a confirmation that differs [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', () => {
	it('refuses it before the account store is called, keeping the names and the address [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		privateEnv.LYRIKS_ALLOW_SIGNUP = '1';
		const { identity, register, services } = teamInstallation();
		const event = post('/login', { firstName: ' Ada ', lastName: 'Lovelace', email: 'ada@example.test', password: 'pw-ada-12345', confirm: 'pw-ada-12354' }, services);
		expect(await run(event)).toEqual({
			failure: 400,
			data: { mode: 'register', email: 'ada@example.test', firstName: 'Ada', lastName: 'Lovelace', message: 'The two passwords do not match.' }
		});
		expect(register).not.toHaveBeenCalled();
		expect(identity.emails()).toEqual(['root@example.test']);
		expect((event as TestEvent).cookies.sets).toEqual([]);
	});

	it('refuses it from an invitation, keeping the invited address [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		const { identity, register, services } = teamInstallation(invitationFor('bea@example.test'));
		const event = post('/login?redirect=%2Fjoin%2Finv-1', { firstName: 'Bea', lastName: '', email: 'bea@example.test', password: 'pw-bea-12345', confirm: '' }, services);
		expect(await run(event)).toEqual({
			failure: 400,
			data: { mode: 'register', email: 'bea@example.test', firstName: 'Bea', lastName: '', message: 'The two passwords do not match.' }
		});
		expect(register).not.toHaveBeenCalled();
		expect(identity.emails()).toEqual(['root@example.test']);
	});

	it('refuses a sign-up posted without any confirmation [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		privateEnv.LYRIKS_ALLOW_SIGNUP = '1';
		const { register, services } = teamInstallation();
		const outcome = await run(post('/login', { email: 'ada@example.test', password: 'pw-ada-12345' }, services));
		expect(outcome).toMatchObject({ failure: 400, data: { message: 'The two passwords do not match.' } });
		expect(register).not.toHaveBeenCalled();
	});

	it('creates the account and signs the person in when the two match [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		const { identity, register, services } = teamInstallation(invitationFor('bea@example.test'));
		const event = post('/login?redirect=%2Fjoin%2Finv-1', { firstName: 'Bea', email: 'bea@example.test', password: 'pw-bea-12345', confirm: 'pw-bea-12345' }, services);
		expect(await run(event)).toEqual({ redirect: '/join/inv-1' });
		expect(register).toHaveBeenCalledWith({ email: 'bea@example.test', password: 'pw-bea-12345', firstName: 'Bea' });
		expect(identity.emails()).toEqual(['root@example.test', 'bea@example.test']);
		expect((event as TestEvent).cookies.sets).toHaveLength(1);
	});
});

describe('the rules sign-up already had stay with the confirmation [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', () => {
	it('refuses a closed invitation whatever the two passwords say [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		const { identity, register, services } = teamInstallation(invitationFor('bea@example.test'));
		for (const confirm of ['pw-walk-12345', 'something-else']) {
			const outcome = await run(post('/login', { email: 'walk-in@example.test', password: 'pw-walk-12345', confirm }, services));
			expect(outcome).toEqual({ failure: 403, data: { mode: 'register', message: 'Self-service signup is disabled. Contact your administrator.' } });
		}
		expect(register).not.toHaveBeenCalled();
		expect(identity.emails()).toEqual(['root@example.test']);
	});

	it('creates nothing for a password shorter than eight characters, typed twice [criterion:ac-leaf-f2572246-2f70-487f-8d8c-e1ac29589499]', async () => {
		privateEnv.LYRIKS_ALLOW_SIGNUP = '1';
		const { rows, services } = communityStore();
		const outcome = await run(post('/login', { email: 'ada@example.test', password: 'seven77', confirm: 'seven77' }, services));
		expect(outcome).toEqual({ failure: 400, data: { mode: 'register', email: 'ada@example.test', message: 'Choose a password of at least 8 characters.' } });
		expect(rows).toEqual([]);
	});
});
