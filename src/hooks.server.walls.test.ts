import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import type { IdentityAccount } from '$application/ports';
import type { LicenseView } from '$domain/licensing';
import type { AppServices } from '$composition/container.server';

/**
 * The real request hook with its walls switched on: sign-in, product licence,
 * the generated-password change, the first configuration, the runtime CSRF check
 * and the security headers. Only the environment and the composition root are
 * replaced; every guard module the hook calls is the shipped one.
 */
const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const publicEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const root = vi.hoisted(() => ({ services: null as unknown }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: publicEnv }));
vi.mock('$composition/container.server', () => ({ getServices: () => root.services }));

import { requestEvent, servicesWith, type TestEvent } from '$lib/server/request-event.fixture';

const ADA: IdentityAccount = { id: 'u-ada', email: 'ada@example.test', mustChangePassword: false };
const ADMIN: IdentityAccount = { id: 'u-root', email: 'root@example.test', mustChangePassword: false };

const ACTIVE: LicenseView = {
	status: 'active',
	entitlements: {
		licenseId: 'lic-1',
		customer: 'Acme',
		edition: 'enterprise',
		seats: 5,
		issuedAt: '2026-01-01T00:00:00.000Z',
		expiresAt: null
	},
	daysRemaining: null,
	activatedAt: '2026-01-02T00:00:00.000Z'
};
const UNLICENSED: LicenseView = { status: 'unlicensed', entitlements: null, daysRemaining: null, activatedAt: null };
const EXPIRED: LicenseView = { ...ACTIVE, status: 'expired', daysRemaining: 0 };

interface Installation {
	/** Who the session cookie belongs to; null: a token the identity source refuses. */
	readonly account?: IdentityAccount | null | 'unreachable';
	/** The licence in force; 'off' when activation is not enforced. */
	readonly licence?: LicenseView | 'off';
	/** Whether an administrator answered the first configuration. */
	readonly configured?: boolean;
	/** The online feedback relay, '' when the channel is off. */
	readonly feedback?: string;
}

/** Everything the hook reads from the composition root, for one installation. */
function installation(o: Installation = {}): AppServices {
	const licence = o.licence ?? ACTIVE;
	return servicesWith({
		pingDatastore: async () => {},
		syncBackLicence: { execute: async () => false },
		identity: { configured: true, multiUser: true, verify: async () => (o.account === undefined ? ADA : o.account) },
		licenseRequired: () => licence !== 'off',
		loadActivation: { execute: async () => (licence === 'off' ? UNLICENSED : licence) },
		loadInstallConfiguration: {
			execute: async () => ({
				validated: o.configured ?? true,
				validatedAt: null,
				validatedBy: null,
				updateCheck: false,
				feedbackOnline: false,
				onlineHelp: false,
				specLanguage: 'en'
			})
		},
		feedbackEndpoint: () => o.feedback ?? ''
	});
}

/** What SvelteKit's page renderer answers with: an HTML page under the compiled policy. */
const PAGE_CSP =
	"default-src 'self'; connect-src 'self' ws: wss:; frame-src 'self' blob:; form-action 'self' http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'";
const served: string[] = [];
async function resolve(event: TestEvent): Promise<Response> {
	served.push(event.url.pathname);
	if (event.url.pathname.startsWith('/api/')) return Response.json({ ok: true });
	if (event.url.pathname.startsWith('/_app/')) return new Response('js', { headers: { 'content-type': 'text/javascript' } });
	return new Response('<!doctype html>', { headers: { 'content-type': 'text/html', 'content-security-policy': PAGE_CSP } });
}

type Outcome = { response: Response; redirect: null; event: TestEvent } | { response: null; redirect: string; event: TestEvent };

/** One request through the real hook, signed in unless the test drops the cookie. */
async function visit(
	path: string,
	init: { cookie?: string | null; method?: string; headers?: Record<string, string> } = {}
): Promise<Outcome> {
	const cookie = init.cookie === undefined ? 'session-jwt' : init.cookie;
	const event = requestEvent({
		path,
		method: init.method,
		headers: init.headers,
		cookies: cookie ? { lyriks_session: cookie } : {}
	});
	try {
		const response = await handle({ event, resolve: (e) => resolve(e as TestEvent) });
		return { response, redirect: null, event };
	} catch (thrown) {
		if (isRedirect(thrown)) return { response: null, redirect: thrown.location, event };
		throw thrown;
	}
}

root.services = installation();
const { handle, handleError } = await import('./hooks.server');

beforeEach(() => {
	served.length = 0;
	privateEnv.LYRIKS_AUTH_REQUIRED = '1';
	privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN.email;
	root.services = installation();
});

afterEach(() => {
	for (const key of Object.keys(privateEnv)) delete privateEnv[key];
	for (const key of Object.keys(publicEnv)) delete publicEnv[key];
});

describe('the sign-in wall', () => {
	it('sends a visitor without a session to sign in, carrying where they were going', async () => {
		const { redirect } = await visit('/projects/p-1/features?tab=rules', { cookie: null });
		expect(redirect).toBe(`/login?redirect=${encodeURIComponent('/projects/p-1/features?tab=rules')}`);
		expect(served).toEqual([]);
	});

	it('tells the sign-in page the account service was unreachable instead of calling the session invalid', async () => {
		root.services = installation({ account: 'unreachable' });
		const { redirect, event } = await visit('/projects');
		expect(redirect).toBe(`/login?redirect=${encodeURIComponent('/projects')}&reason=unreachable`);
		expect(event.cookies.deletes).toEqual([]);
	});

	it('answers the dashboard data plane with a JSON 401 rather than a login page', async () => {
		const { response } = await visit('/behavior/api/features', { cookie: null });
		expect(response?.status).toBe(401);
		expect(await response?.json()).toEqual({ error: 'unauthenticated' });
		expect(served).toEqual([]);
	});

	it('leaves the sign-in page and the health probes open without a session', async () => {
		for (const path of ['/login', '/logout', '/healthz', '/readyz', '/api/first-run']) {
			const { response } = await visit(path, { cookie: null });
			expect(response?.status, path).toBe(200);
		}
		expect(served).toEqual(['/login', '/logout', '/healthz', '/readyz', '/api/first-run']);
	});

	it('serves static assets without asking who is calling or whether the product is licensed', async () => {
		root.services = installation({ account: null, licence: UNLICENSED });
		const { response } = await visit('/_app/immutable/entry/start.js', { cookie: null });
		expect(response?.status).toBe(200);
		expect(served).toEqual(['/_app/immutable/entry/start.js']);
	});

	it('exposes the signed-in account on the request, never the token', async () => {
		const { event } = await visit('/projects');
		expect(event.locals.session).toEqual({ isAuthenticated: true, email: ADA.email, mustChangePassword: false });
		expect(JSON.stringify(event.locals.session)).not.toContain('session-jwt');
	});
});

describe('the licence wall', () => {
	it('refuses an API call on an unactivated installation with 402 and the licence status', async () => {
		root.services = installation({ licence: UNLICENSED });
		const { response } = await visit('/api/projects');
		expect(response?.status).toBe(402);
		expect(await response?.json()).toEqual({ error: 'not_activated', status: 'unlicensed' });
		expect(served).toEqual([]);
	});

	it('sends every page of an installation whose licence expired to the activation screen', async () => {
		root.services = installation({ licence: EXPIRED });
		const { redirect } = await visit('/projects');
		expect(redirect).toBe('/activate');
		expect(served).toEqual([]);
	});

	it('keeps the activation screen and the licence API reachable while unactivated', async () => {
		root.services = installation({ licence: UNLICENSED });
		for (const path of ['/activate', '/api/license', '/api/license/preview']) {
			const { response } = await visit(path);
			expect(response?.status, path).toBe(200);
		}
		expect(served).toEqual(['/activate', '/api/license', '/api/license/preview']);
	});

	it('lets an activated installation through and hands the licence to the request', async () => {
		const { response, event } = await visit('/api/projects');
		expect(response?.status).toBe(200);
		expect(event.locals.licenseRequired).toBe(true);
		expect(event.locals.license).toEqual(ACTIVE);
	});

	it('asks for no licence where activation is not enforced', async () => {
		root.services = installation({ licence: 'off' });
		const { response, event } = await visit('/api/projects');
		expect(response?.status).toBe(200);
		expect(event.locals.licenseRequired).toBe(false);
		expect(event.locals.license).toBeNull();
	});

	it('walls an unactivated installation even with sign-in off', async () => {
		delete privateEnv.LYRIKS_AUTH_REQUIRED;
		root.services = installation({ licence: UNLICENSED });
		const { response } = await visit('/api/projects', { cookie: null });
		expect(response?.status).toBe(402);
		expect(served).toEqual([]);
	});
});

describe('the generated-password wall', () => {
	const fresh: IdentityAccount = { ...ADA, mustChangePassword: true };

	it('sends an account still on its generated password to the password form of Settings', async () => {
		root.services = installation({ account: fresh });
		const { redirect } = await visit('/projects');
		expect(redirect).toBe('/settings?password=change#account');
		expect(served).toEqual([]);
	});

	it('leaves Settings and the API open so the change can be made', async () => {
		root.services = installation({ account: fresh });
		expect((await visit('/settings')).response?.status).toBe(200);
		expect((await visit('/api/account/password', { method: 'POST' })).response?.status).toBe(200);
		expect(served).toEqual(['/settings', '/api/account/password']);
	});

	it('lets the account reach the activation screen first on an unactivated installation, with no ping-pong', async () => {
		root.services = installation({ account: fresh, licence: UNLICENSED });
		expect((await visit('/activate')).response?.status).toBe(200);
		expect(served).toEqual(['/activate']);
	});
});

describe('the first-configuration wall', () => {
	it('sends an administrator to the first configuration while nobody has answered it', async () => {
		root.services = installation({ account: ADMIN, configured: false });
		const { redirect } = await visit('/projects');
		expect(redirect).toBe('/first-configuration');
		expect(served).toEqual([]);
	});

	it('lets the licence holder through to it as an administrator too', async () => {
		delete privateEnv.LYRIKS_ADMIN_EMAILS;
		const holder: LicenseView = { ...ACTIVE, entitlements: { ...ACTIVE.entitlements!, email: ADA.email } };
		root.services = installation({ account: ADA, licence: holder, configured: false });
		expect((await visit('/projects')).redirect).toBe('/first-configuration');
	});

	it('lets a member who is not an administrator through while it waits', async () => {
		root.services = installation({ account: ADA, configured: false });
		expect((await visit('/projects')).response?.status).toBe(200);
	});

	it('leaves the form itself and the API open to the administrator', async () => {
		root.services = installation({ account: ADMIN, configured: false });
		expect((await visit('/first-configuration')).response?.status).toBe(200);
		expect((await visit('/api/settings/install-configuration', { method: 'POST' })).response?.status).toBe(200);
	});

	it('asks the password change before the first configuration', async () => {
		root.services = installation({ account: { ...ADMIN, mustChangePassword: true }, configured: false });
		expect((await visit('/projects')).redirect).toBe('/settings?password=change#account');
		expect((await visit('/settings')).response?.status).toBe(200);
	});

	it('opens the product once an administrator answered it', async () => {
		root.services = installation({ account: ADMIN, configured: true });
		expect((await visit('/projects')).response?.status).toBe(200);
	});
});

describe('the cross-origin write check', () => {
	it('refuses a write whose Origin names another site before it reaches the route', async () => {
		const failure = await visit('/api/projects', { method: 'POST', headers: { origin: 'https://evil.test' } }).catch((e: unknown) => e);
		expect(isHttpError(failure) && failure.status).toBe(403);
		expect(served).toEqual([]);
	});

	it('refuses an origin-less write that Fetch Metadata marks as cross-site', async () => {
		const failure = await visit('/api/projects', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }).catch((e: unknown) => e);
		expect(isHttpError(failure) && failure.status).toBe(403);
		expect(served).toEqual([]);
	});

	it('accepts a write from its own origin and from an allowlisted one', async () => {
		privateEnv.LYRIKS_TRUSTED_ORIGINS = 'https://public.example.test/';
		expect((await visit('/api/projects', { method: 'POST', headers: { origin: 'https://lyriks.test' } })).response?.status).toBe(200);
		expect((await visit('/api/projects', { method: 'POST', headers: { origin: 'https://public.example.test' } })).response?.status).toBe(200);
	});
});

describe('the security headers', () => {
	const HARDENING = {
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'cross-origin-opener-policy': 'same-origin'
	};

	it('hardens a page, an API answer and a refusal alike', async () => {
		root.services = installation({ licence: UNLICENSED });
		const page = (await visit('/activate')).response!;
		const refusal = (await visit('/api/projects')).response!;
		root.services = installation();
		const api = (await visit('/api/projects')).response!;
		for (const response of [page, refusal, api]) {
			for (const [name, value] of Object.entries(HARDENING)) expect(response.headers.get(name), name).toBe(value);
			expect(response.headers.get('permissions-policy')).toContain('camera=()');
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
	});

	it('lets the behavior dashboard be framed by its own origin only', async () => {
		const { response } = await visit('/behavior');
		expect(response?.headers.get('x-frame-options')).toBe('SAMEORIGIN');
	});

	it('keeps a static asset cacheable', async () => {
		const { response } = await visit('/_app/immutable/entry/start.js');
		expect(response?.headers.get('cache-control')).toBeNull();
		expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('demands HTTPS on later visits only when the request came over HTTPS', async () => {
		const overTls = (await visit('/projects', { headers: { 'x-forwarded-proto': 'https' } })).response!;
		expect(overTls.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
		const plain = (await visit('/projects', { headers: { 'x-forwarded-proto': 'http' } })).response!;
		expect(plain.headers.get('strict-transport-security')).toBeNull();
	});

	it('lets the page post feedback to the configured relay and nowhere else', async () => {
		root.services = installation({ feedback: 'https://relay.example.test/v1/feedback' });
		const csp = (await visit('/projects')).response!.headers.get('content-security-policy')!;
		expect(csp).toContain("connect-src 'self' ws: wss: https://relay.example.test;");
		expect(csp.match(/relay\.example\.test/g)).toHaveLength(1);
	});

	it('leaves the policy untouched when the feedback channel is off', async () => {
		root.services = installation({ feedback: '' });
		expect((await visit('/projects')).response!.headers.get('content-security-policy')).toBe(PAGE_CSP);
	});

	it('names the behavior dashboard origin in frame-src and form-action, once each', async () => {
		publicEnv.PUBLIC_UNSPA_DASHBOARD_URL = 'https://lyriks.test:8173/some/path';
		const csp = (await visit('/projects')).response!.headers.get('content-security-policy')!;
		expect(csp).toContain("frame-src 'self' blob: https://lyriks.test:8173;");
		expect(csp).toContain("form-action 'self' http://localhost:* http://127.0.0.1:* https://lyriks.test:8173;");
		expect(csp).toContain("connect-src 'self' ws: wss:;");
	});
});

describe('unexpected server errors', () => {
	it('hand the client the safe message and nothing of the error itself', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const event = requestEvent({ path: '/projects' });
		const secret = new Error('connect ECONNREFUSED postgres://lyriks:hunter2@db:5432');
		expect(handleError({ error: secret, status: 500, message: 'Internal Error', event })).toEqual({ message: 'Internal Error' });
		spy.mockRestore();
	});
});
