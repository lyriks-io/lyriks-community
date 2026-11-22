import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AuditEvent, UpdateFeedPort } from '$application/ports';
import { CheckForUpdateUseCase } from '$application/operations/check-for-update';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { GET, POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * Whether a newer release exists: operator information, asked of the
 * registry only when an administrator allowed it, or confirmed one single
 * check. The feed is the one place the installation would call out; the test
 * counts every time it is asked.
 */

const ADMIN = 'root@example.test';
let asked: number;
let audit: AuditEvent[];

function call(method: 'GET' | 'POST', opts: { body?: unknown; email?: string; allowed?: boolean; query?: string } = {}) {
	const feed = {
		destination: 'registry.example.test',
		listVersions: async () => {
			asked += 1;
			return ['2026.11-60', '2026.11-70'];
		}
	} satisfies UpdateFeedPort;
	const checkForUpdate = new CheckForUpdateUseCase(feed, async () => '2026.11-60', { nowIso: () => '2026-11-18T03:00:00.000Z' }, async () => opts.allowed ?? false);
	const event = requestEvent({
		path: `/api/updates${opts.query ?? ''}`,
		method,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
		authRequired: true,
		session: { isAuthenticated: true, email: opts.email ?? ADMIN },
		services: servicesWith({ checkForUpdate, audit: { record: (e) => void audit.push(e) } })
	});
	return Promise.resolve(method === 'GET' ? GET(event) : POST(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

beforeEach(() => {
	asked = 0;
	audit = [];
	privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
});

afterEach(() => {
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('checking for a newer release', () => {
	it('asks nobody while the check is off, unless an administrator confirms one single check', async () => {
		expect((await call('GET')).body).toMatchObject({ state: 'unknown', reason: 'off' });
		expect((await call('POST', { body: {} })).body).toMatchObject({ state: 'unknown', reason: 'off' });
		expect((await call('POST', { body: { once: 'true' } })).body).toMatchObject({ reason: 'off' });
		expect(asked).toBe(0);
		expect((await call('POST', { body: { once: true } })).body).toMatchObject({ state: 'available', latest: '2026.11-70' });
		expect(asked).toBe(1);
	});

	it('records a confirmed check in the audit trail, naming who asked and where', async () => {
		await call('POST', { body: { once: true } });
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ action: 'updates.check_once', actor: ADMIN, outcome: 'success' });
		expect(audit[0].detail).toContain('registry.example.test');
		expect(audit[0].detail).toContain('2026.11-70');
	});

	it('asks the registry when an administrator allowed the check', async () => {
		expect((await call('GET', { allowed: true })).body).toMatchObject({ state: 'available' });
		expect(asked).toBe(1);
		expect(audit).toEqual([]);
	});

	it('tells a member nothing, and asks nobody for them', async () => {
		expect((await call('GET', { email: 'member@example.test', allowed: true })).status).toBe(403);
		expect((await call('POST', { email: 'member@example.test', body: { once: true } })).status).toBe(403);
		expect(asked).toBe(0);
		expect(audit).toEqual([]);
	});
});
