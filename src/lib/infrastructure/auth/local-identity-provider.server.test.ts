import { describe, expect, it } from 'vitest';
import { jwtVerify } from 'jose';
import { IdentityError } from '$application/ports';
import { LocalIdentityProvider, type OperatorAccountRow, type QueryFn } from './local-identity-provider.server';

/** The operator_accounts table, in memory, answering the four statements the adapter issues. */
function fakeStore(): { query: QueryFn; rows: OperatorAccountRow[] } {
	const rows: OperatorAccountRow[] = [];
	const query = (async (sql: string, params: readonly unknown[] = []) => {
		if (sql.startsWith('SELECT count')) return { rows: [{ n: rows.length }] };
		if (sql.startsWith('INSERT')) {
			const row = {
				id: `acc-${rows.length + 1}`,
				email: String(params[0]),
				password_hash: String(params[1]),
				must_change_password: params[2] === true,
			session_version: 0
			};
			rows.push(row);
			return { rows: [{ id: row.id }] };
		}
		if (sql.includes('WHERE email = $1')) return { rows: rows.filter((r) => r.email === params[0]) };
		if (sql.includes('WHERE id = $1') && sql.startsWith('SELECT')) return { rows: rows.filter((r) => r.id === params[0]) };
		if (sql.startsWith('UPDATE')) {
			const row = rows.find((r) => r.id === params[0]);
			if (row) {
				row.session_version++;
				if (params[1] !== undefined) row.password_hash = String(params[1]);
				row.must_change_password = false;
			}
			return { rows: [] };
		}
		throw new Error(`unexpected sql: ${sql}`);
	}) as QueryFn;
	return { query, rows };
}

const SECRET = 'a-shared-secret-long-enough-for-tests-0123456789';

describe('LocalIdentityProvider', () => {
	it('claims the install once: register, then the window closes', async () => {
		const store = fakeStore();
		const identity = new LocalIdentityProvider(SECRET, store.query);
		expect(await identity.installUnclaimed()).toBe(true);
		const first = await identity.register({ email: 'Ops@Example.com', password: 'longenough' });
		expect('token' in first).toBe(true);
		expect(store.rows[0].email).toBe('ops@example.com');
		expect(await identity.installUnclaimed()).toBe(false);
		const second = await identity.register({ email: 'other@example.com', password: 'longenough' });
		expect(second).toEqual({ error: expect.stringMatching(/registration is closed/) });
	});

	it('signs a token the MCP gateway can verify with the shared secret (sub = account id)', async () => {
		const store = fakeStore();
		const identity = new LocalIdentityProvider(SECRET, store.query);
		await identity.register({ email: 'ops@example.com', password: 'longenough', mustChangePassword: true });
		const login = await identity.login('ops@example.com', 'longenough');
		if (!('token' in login)) throw new Error('login refused');
		const { payload } = await jwtVerify(login.token, new TextEncoder().encode(SECRET));
		expect(payload.sub).toBe('acc-1');
		expect(await identity.verify(login.token)).toEqual({
			id: 'acc-1',
			email: 'ops@example.com',
			mustChangePassword: true
		});
		expect(await identity.login('ops@example.com', 'wrong')).toEqual({ error: 'Invalid email or password.' });
		expect(await identity.verify('not-a-token')).toBeNull();
	});

	it('changes the password behind the current one and clears the first-login wall', async () => {
		const store = fakeStore();
		const identity = new LocalIdentityProvider(SECRET, store.query);
		await identity.register({ email: 'ops@example.com', password: 'longenough', mustChangePassword: true });
		const login = await identity.login('ops@example.com', 'longenough');
		if (!('token' in login)) throw new Error('login refused');
		await expect(identity.changePassword(login.token, 'wrong', 'twelve-chars-ok')).rejects.toMatchObject({
			status: 401
		});
		await expect(identity.changePassword(login.token, 'longenough', 'short')).rejects.toBeInstanceOf(IdentityError);
		await identity.changePassword(login.token, 'longenough', 'twelve-chars-ok');
		expect(await identity.verify(login.token)).toBeNull();
		expect('token' in (await identity.login('ops@example.com', 'twelve-chars-ok'))).toBe(true);
	});

	it('reports an unreadable store honestly', async () => {
		const broken = (async () => {
			throw new Error('connection refused');
		}) as unknown as QueryFn;
		const identity = new LocalIdentityProvider(SECRET, broken);
		expect(await identity.installUnclaimed()).toBe(false);
		expect(await identity.registrationOpen()).toBe(true);
	});
});


it('logout revokes all operator sessions, while a subsequent login works', async () => {
	const store = fakeStore();
	const identity = new LocalIdentityProvider(SECRET, store.query);
	const first = await identity.register({ email: 'ops@example.com', password: 'longenough' });
	if (!('token' in first)) throw new Error('registration failed');
	await identity.revokeSessions(first.token);
	expect(await identity.verify(first.token)).toBeNull();
	const fresh = await identity.login('ops@example.com', 'longenough');
	if (!('token' in fresh)) throw new Error('login failed');
	expect(await identity.verify(fresh.token)).toMatchObject({ id: 'acc-1' });
});
