import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { AuditEvent } from '$application/ports';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { actions } from './+page.server';
import { requestEvent, servicesWith, type FakeServices, type TestEvent } from '$lib/server/request-event.fixture';
import { memoryIdentity, type MemoryIdentity } from '$lib/server/identity.fixture';
import { ACME_KEY, licenceDesk } from '$lib/server/licence-desk.fixture';

/**
 * The sign-in page's form actions over an in-memory identity source: what a
 * visitor is told, whether a session cookie is issued, which account exists
 * afterwards, where they land.
 */

type ActionEvent = Parameters<NonNullable<typeof actions.login>>[0];

let ip = 0;
/** Each test posts from its own address: the credential throttle is per client. */
function post(path: string, fields: Record<string, string>, services: FakeServices, opts: { authRequired?: boolean; address?: string } = {}) {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	const address = opts.address ?? `10.1.${Math.floor(++ip / 250)}.${ip % 250}`;
	const event: TestEvent = requestEvent({ path, method: 'POST', body: form, authRequired: opts.authRequired ?? true, services: servicesWith(services) });
	event.getClientAddress = () => address;
	return event as ActionEvent;
}

async function run(action: ((event: ActionEvent) => unknown) | undefined, event: ActionEvent) {
	try {
		const result: unknown = await action!(event);
		if (isActionFailure(result)) return { failure: result.status, data: result.data as unknown as Record<string, unknown> };
		return { data: (result ?? {}) as Record<string, unknown> };
	} catch (thrown) {
		if (isRedirect(thrown)) return { redirect: thrown.location };
		throw thrown;
	}
}

function installation(identity: MemoryIdentity, extra: FakeServices = {}) {
	const audit: AuditEvent[] = [];
	const services: FakeServices = {
		identity,
		installEdition: () => 'enterprise',
		licenseRequired: () => false,
		enterpriseHooks: null,
		audit: { record: (event) => void audit.push(event) },
		...extra
	};
	return { services, audit };
}

afterEach(() => {
	for (const key of Object.keys(privateEnv)) delete privateEnv[key];
});

describe('signing in', () => {
	it('issues the session cookie for the right password and returns where the visitor was going', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test', password: 'pw-ada-123' }]);
		const { services, audit } = installation(identity);
		const event = post('/login?redirect=%2Fprojects%2Fp-1', { email: ' ada@example.test ', password: 'pw-ada-123' }, services);
		expect(await run(actions.login, event)).toEqual({ redirect: '/projects/p-1' });
		const [cookie] = (event as TestEvent).cookies.sets;
		expect(cookie.name).toBe('lyriks_session');
		expect(identity.accountOf(cookie.value)?.email).toBe('ada@example.test');
		expect(cookie.opts.httpOnly).toBe(true);
		expect(audit).toEqual([{ action: 'auth.login', actor: 'ada@example.test', outcome: 'success' }]);
	});

	it('never sends the visitor off-site after signing in', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test', password: 'pw-ada-123' }]);
		const event = post('/login?redirect=https%3A%2F%2Fevil.test%2F', { email: 'ada@example.test', password: 'pw-ada-123' }, installation(identity).services);
		expect(await run(actions.login, event)).toEqual({ redirect: '/' });
	});

	it('refuses a wrong password with the source message, issuing no cookie and recording the failure', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test', password: 'pw-ada-123' }]);
		const { services, audit } = installation(identity);
		const event = post('/login', { email: 'ada@example.test', password: 'guess' }, services);
		expect(await run(actions.login, event)).toEqual({ failure: 400, data: { mode: 'login', email: 'ada@example.test', message: 'Invalid email or password.' } });
		expect((event as TestEvent).cookies.sets).toEqual([]);
		expect(audit).toMatchObject([{ action: 'auth.login', outcome: 'failure' }]);
	});

	it('asks for both fields before asking the identity source', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test' }]);
		const event = post('/login', { email: 'ada@example.test', password: '' }, installation(identity).services);
		expect(await run(actions.login, event)).toMatchObject({ failure: 400 });
		expect((event as TestEvent).cookies.sets).toEqual([]);
	});

	it('refuses, on Community, a former member who is not the installation holder', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = 'holder@example.test';
		const identity = memoryIdentity([{ email: 'holder@example.test', password: 'pw-holder' }, { email: 'former@example.test', password: 'pw-former' }]);
		const { services } = installation(identity, { installEdition: () => 'community' });
		const former = post('/login', { email: 'former@example.test', password: 'pw-former' }, services);
		expect(await run(actions.login, former)).toMatchObject({ failure: 403, data: { mode: 'login' } });
		expect((former as TestEvent).cookies.sets).toEqual([]);
		const holder = post('/login', { email: 'holder@example.test', password: 'pw-holder' }, services);
		expect(await run(actions.login, holder)).toEqual({ redirect: '/' });
	});

	it('throttles an address after ten attempts in a window, without asking the identity source', async () => {
		const identity = memoryIdentity([{ email: 'ada@example.test', password: 'pw-ada-123' }]);
		const { services, audit } = installation(identity);
		for (let i = 0; i < 10; i++) await run(actions.login, post('/login', { email: 'ada@example.test', password: 'guess' }, services, { address: '10.9.9.9' }));
		const eleventh = await run(actions.login, post('/login', { email: 'ada@example.test', password: 'pw-ada-123' }, services, { address: '10.9.9.9' }));
		expect(eleventh).toMatchObject({ failure: 429 });
		expect(audit).toHaveLength(10);
		expect(await run(actions.login, post('/login', { email: 'ada@example.test', password: 'pw-ada-123' }, services, { address: '10.9.9.10' }))).toEqual({ redirect: '/' });
	});
});

describe('signing up', () => {
	/** An Enterprise installation with signup closed and one open invitation for `invitee`. */
	function invitedInstallation(invitee: string) {
		const identity = memoryIdentity([{ email: 'root@example.test' }]);
		return {
			identity,
			...installation(identity, {
				enterpriseHooks: {
					callerReach: async () => null,
					invitationBehind: async (redirectTo) =>
						redirectTo.startsWith('/join/') ? { token: 'inv-1', invitation: { email: invitee, workspaceName: 'Acme' } } : { token: null, invitation: null },
					settingsMembers: async () => null,
					settingsReclaim: async () => null
				}
			})
		};
	}

	it('refuses an invitation used by another address than the one it was issued to', async () => {
		const { identity, services } = invitedInstallation('invitee@example.test');
		const event = post('/login?redirect=%2Fjoin%2Finv-1', { email: 'intruder@example.test', password: 'pw-intruder', confirm: 'pw-intruder' }, services);
		const outcome = await run(actions.register, event);
		expect(outcome).toMatchObject({ failure: 400, data: { mode: 'register', email: 'intruder@example.test' } });
		expect(String(outcome.data?.message)).toContain('invitee@example.test');
		expect(identity.emails()).toEqual(['root@example.test']);
		expect((event as TestEvent).cookies.sets).toEqual([]);
	});

	it('opens the account for the invited address, whatever its case, with signup closed', async () => {
		const { identity, services } = invitedInstallation('invitee@example.test');
		const event = post('/login?redirect=%2Fjoin%2Finv-1', { email: 'Invitee@Example.test', password: 'pw-invitee', confirm: 'pw-invitee', firstName: 'Ina' }, services);
		expect(await run(actions.register, event)).toEqual({ redirect: '/join/inv-1' });
		expect(identity.emails()).toEqual(['root@example.test', 'Invitee@Example.test']);
		expect((event as TestEvent).cookies.sets).toHaveLength(1);
	});

	it('refuses sign-up without an invitation while signup is closed', async () => {
		const { identity, services } = invitedInstallation('invitee@example.test');
		const outcome = await run(actions.register, post('/login', { email: 'walk-in@example.test', password: 'pw', confirm: 'pw' }, services));
		expect(outcome).toMatchObject({ failure: 403, data: { mode: 'register' } });
		expect(identity.emails()).toEqual(['root@example.test']);
	});

	it('lets anyone sign up where the operator opened signup', async () => {
		privateEnv.LYRIKS_ALLOW_SIGNUP = '1';
		const { identity, services } = invitedInstallation('invitee@example.test');
		expect(await run(actions.register, post('/login', { email: 'walk-in@example.test', password: 'pw', confirm: 'pw' }, services))).toEqual({ redirect: '/' });
		expect(identity.emails()).toContain('walk-in@example.test');
	});

	it('sends an invitee who already has an account to sign in instead', async () => {
		const { services } = invitedInstallation('root@example.test');
		const outcome = await run(actions.register, post('/login?redirect=%2Fjoin%2Finv-1', { email: 'root@example.test', password: 'pw', confirm: 'pw' }, services));
		expect(outcome).toMatchObject({ failure: 400, data: { mode: 'login', email: 'root@example.test' } });
	});
});

describe('claiming a fresh installation with its licence key', () => {
	function freshInstallation() {
		const identity = memoryIdentity([]);
		const desk = licenceDesk();
		const { services, audit } = installation(identity, { ...desk.services, licenseRequired: () => true });
		return { identity, desk, services, audit };
	}

	it('checks that the key was issued to the address before asking for a password', async () => {
		const { services } = freshInstallation();
		const ok = await run(actions.firstRunCheck, post('/login', { email: 'holder@example.test', key: ACME_KEY }, services));
		expect(ok).toMatchObject({ data: { step: 'password', email: 'holder@example.test' } });
		const other = await run(actions.firstRunCheck, post('/login', { email: 'someone@example.test', key: ACME_KEY }, services));
		expect(other).toMatchObject({ failure: 400, data: { reason: 'mismatch' } });
		const forged = await run(actions.firstRunCheck, post('/login', { email: 'holder@example.test', key: 'KEY-FORGED' }, services));
		expect(forged).toMatchObject({ failure: 400, data: { reason: 'invalid' } });
	});

	it('activates the key, creates the account, signs it in and tells the identity source who claimed it', async () => {
		const { identity, desk, services } = freshInstallation();
		const event = post('/login', { email: 'holder@example.test', key: ACME_KEY, password: 'pw-holder', confirm: 'pw-holder' }, services);
		expect(await run(actions.firstRunCreate, event)).toEqual({ redirect: '/' });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([true]);
		expect(identity.emails()).toEqual(['holder@example.test']);
		const [cookie] = (event as TestEvent).cookies.sets;
		expect(identity.firstRuns).toEqual([{ token: cookie.value, customer: 'Acme', edition: 'enterprise' }]);
	});

	it('stores nothing when the passwords differ or the key names another address', async () => {
		const { identity, desk, services } = freshInstallation();
		const mismatch = await run(actions.firstRunCreate, post('/login', { email: 'holder@example.test', key: ACME_KEY, password: 'a', confirm: 'b' }, services));
		expect(mismatch).toMatchObject({ failure: 400, data: { step: 'password' } });
		const stranger = await run(actions.firstRunCreate, post('/login', { email: 'someone@example.test', key: ACME_KEY, password: 'a', confirm: 'a' }, services));
		expect(stranger).toMatchObject({ failure: 400 });
		expect(desk.current()).toBeNull();
		expect(identity.emails()).toEqual([]);
	});

	it('refuses both steps once an account exists', async () => {
		const identity = memoryIdentity([{ email: 'holder@example.test' }]);
		const desk = licenceDesk();
		const { services } = installation(identity, { ...desk.services, licenseRequired: () => true });
		const fields = { email: 'holder@example.test', key: ACME_KEY, password: 'x', confirm: 'x' };
		expect(await run(actions.firstRunCheck, post('/login', fields, services))).toMatchObject({ failure: 403 });
		expect(await run(actions.firstRunCreate, post('/login', fields, services))).toMatchObject({ failure: 403 });
		expect(desk.current()).toBeNull();
		expect(identity.emails()).toEqual(['holder@example.test']);
	});
});
