import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { DELETE, GET, POST } from './+server';
import { POST as restorePrevious } from './previous/+server';
import { POST as preview } from './preview/+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { ACME_KEY, RENEWAL_KEY, licenceDesk, type LicenceDesk } from '$lib/server/licence-desk.fixture';

/**
 * The headless licence API an install script drives: read the status, activate,
 * preview, step back, clear. Every mutation is an administrator's; the use-cases
 * behind it are the real ones over an in-memory activation store.
 */

const ADMIN = 'root@example.test';

function call(desk: LicenceDesk, opts: { email?: string; method?: string; path?: string; body?: unknown } = {}) {
	return requestEvent({
		path: opts.path ?? '/api/license',
		method: opts.method ?? 'POST',
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
		headers: { 'content-type': 'application/json' },
		authRequired: true,
		session: { isAuthenticated: true, email: opts.email ?? ADMIN },
		services: servicesWith(desk.services)
	});
}

async function statusOf(run: Response | Promise<Response>): Promise<number> {
	return Promise.resolve(run).then(
		(response) => response.status,
		(failure: unknown) => (isHttpError(failure) ? failure.status : Promise.reject(failure))
	);
}

afterEach(() => {
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('GET /api/license', () => {
	it('reports the activation status of the key in force', async () => {
		const response = await GET(call(licenceDesk({ current: ACME_KEY }), { method: 'GET' }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'active', entitlements: { licenseId: 'lic-acme', seats: 5 } });
	});

	it('reports an install with no key as unlicensed', async () => {
		expect(await (await GET(call(licenceDesk(), { method: 'GET' }))).json()).toMatchObject({ status: 'unlicensed', entitlements: null });
	});
});

describe('POST /api/license', () => {
	it('activates a valid key, seeds the install identity and hands it to the seat gate at once', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		const response = await POST(call(desk, { body: { key: ACME_KEY } }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, view: { status: 'active' } });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.seeded.map((e) => e?.licenseId)).toEqual(['lic-acme']);
		expect(desk.deliveries).toEqual([true]);
		expect(desk.audit.at(-1)).toMatchObject({ actor: ADMIN });
	});

	it('refuses a key that does not verify with 400, storing and delivering nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		const response = await POST(call(desk, { body: { key: 'KEY-FORGED' } }));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([]);
		expect(desk.seeded).toEqual([]);
	});

	it('treats a body without a key as an invalid key', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		expect((await POST(call(desk, { body: { key: 42 } }))).status).toBe(400);
		expect(desk.current()).toBeNull();
	});

	it('refuses a member who is not an administrator, storing nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk();
		expect(await statusOf(POST(call(desk, { email: 'member@example.test', body: { key: ACME_KEY } })))).toBe(403);
		expect(desk.current()).toBeNull();
		expect(desk.deliveries).toEqual([]);
	});

	it('lets the holder of the licence in force replace it', async () => {
		const desk = licenceDesk({ current: ACME_KEY });
		const event = call(desk, { email: 'holder@example.test', body: { key: RENEWAL_KEY } });
		event.locals.license = await desk.services.loadActivation!.execute!();
		expect((await POST(event)).status).toBe(200);
		expect(desk.current()).toBe(RENEWAL_KEY);
		expect(desk.previous()).toBe(ACME_KEY);
	});
});

describe('DELETE /api/license', () => {
	it('removes the key in force and keeps the previous one to go back to', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		expect((await DELETE(call(desk, { method: 'DELETE' }))).status).toBe(200);
		expect(desk.current()).toBeNull();
		expect(desk.previous()).toBe(ACME_KEY);
	});

	it('removes the previous key too when asked', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		await DELETE(call(desk, { method: 'DELETE', path: '/api/license?previousToo=1' }));
		expect([desk.current(), desk.previous()]).toEqual([null, null]);
	});

	it('refuses a member who is not an administrator, removing nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		expect(await statusOf(DELETE(call(desk, { method: 'DELETE', email: 'member@example.test' })))).toBe(403);
		expect(desk.current()).toBe(ACME_KEY);
	});
});

describe('POST /api/license/preview', () => {
	it('answers what a key would grant without storing it', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		const response = await preview(call(desk, { path: '/api/license/preview', body: { key: RENEWAL_KEY } }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, view: { entitlements: { seats: 50 } } });
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.audit).toEqual([]);
	});

	it('answers 400 for a key that does not verify', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		expect((await preview(call(licenceDesk(), { path: '/api/license/preview', body: { key: 'KEY-FORGED' } }))).status).toBe(400);
	});

	it('is closed to members, since it tells whether a key is valid here', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const run = preview(call(licenceDesk(), { email: 'member@example.test', path: '/api/license/preview', body: { key: ACME_KEY } }));
		expect(await statusOf(run)).toBe(403);
	});
});

describe('POST /api/license/previous', () => {
	it('steps back to the previous key and hands it to the seat gate', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		const response = await restorePrevious(call(desk, { path: '/api/license/previous' }));
		expect(response.status).toBe(200);
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([true]);
	});

	it('answers 400 and delivers nothing when there is no previous key', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: ACME_KEY });
		expect((await restorePrevious(call(desk, { path: '/api/license/previous' }))).status).toBe(400);
		expect(desk.current()).toBe(ACME_KEY);
		expect(desk.deliveries).toEqual([]);
	});

	it('refuses a member who is not an administrator', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const desk = licenceDesk({ current: RENEWAL_KEY, previous: ACME_KEY });
		expect(await statusOf(restorePrevious(call(desk, { email: 'member@example.test', path: '/api/license/previous' })))).toBe(403);
		expect(desk.current()).toBe(RENEWAL_KEY);
	});
});
