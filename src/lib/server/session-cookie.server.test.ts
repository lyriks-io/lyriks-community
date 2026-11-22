import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const runtime = vi.hoisted(() => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$app/environment', () => ({
	get dev() {
		return runtime.dev;
	}
}));

import { deleteSessionCookie, refreshSessionCookieDomain, SESSION_COOKIE, setSessionCookie } from './session-cookie.server';
import { cookieJar } from './request-event.fixture';

/** The cookie that carries the session token between the browser and the platform. */

afterEach(() => {
	delete privateEnv.LYRIKS_COOKIE_DOMAIN;
	runtime.dev = false;
});

describe('the session cookie', () => {
	it('is unreadable by scripts, sent over HTTPS only, not sent on cross-site posts, valid site-wide for seven days', () => {
		const jar = cookieJar();
		setSessionCookie(jar, 'jwt-1');
		expect(jar.sets).toEqual([
			{
				name: 'lyriks_session',
				value: 'jwt-1',
				opts: { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 604800, domain: undefined }
			}
		]);
		expect(SESSION_COOKIE).toBe('lyriks_session');
	});

	it('drops the HTTPS-only flag on the development server alone', () => {
		runtime.dev = true;
		const jar = cookieJar();
		setSessionCookie(jar, 'jwt-1');
		expect(jar.sets[0].opts.secure).toBe(false);
	});

	it('stays host-only unless a cookie domain is configured, then names it', () => {
		privateEnv.LYRIKS_COOKIE_DOMAIN = '  ';
		const hostOnly = cookieJar();
		setSessionCookie(hostOnly, 'jwt-1');
		expect(hostOnly.sets[0].opts.domain).toBeUndefined();

		privateEnv.LYRIKS_COOKIE_DOMAIN = 'lyriks.example.test';
		const widened = cookieJar();
		setSessionCookie(widened, 'jwt-1');
		expect(widened.sets[0].opts.domain).toBe('lyriks.example.test');
	});
});

describe('refreshing a session for the configured domain', () => {
	it('re-issues the same token under the configured domain', () => {
		privateEnv.LYRIKS_COOKIE_DOMAIN = 'lyriks.example.test';
		const jar = cookieJar({ lyriks_session: 'jwt-old-host-only' });
		refreshSessionCookieDomain(jar, 'jwt-old-host-only');
		expect(jar.sets).toHaveLength(1);
		expect(jar.sets[0]).toMatchObject({ value: 'jwt-old-host-only', opts: { domain: 'lyriks.example.test', httpOnly: true } });
	});

	it('writes nothing when no domain is configured', () => {
		const jar = cookieJar({ lyriks_session: 'jwt-1' });
		refreshSessionCookieDomain(jar, 'jwt-1');
		expect(jar.sets).toEqual([]);
	});
});

describe('signing a session out of the browser', () => {
	it('deletes the host-only cookie', () => {
		const jar = cookieJar({ lyriks_session: 'jwt-1' });
		deleteSessionCookie(jar);
		expect(jar.deletes).toEqual([{ name: 'lyriks_session', opts: { path: '/' } }]);
		expect(jar.get('lyriks_session')).toBeUndefined();
	});

	it('deletes the domain-wide twin as well when a domain is configured, so neither stays signed in', () => {
		privateEnv.LYRIKS_COOKIE_DOMAIN = 'lyriks.example.test';
		const jar = cookieJar({ lyriks_session: 'jwt-1' });
		deleteSessionCookie(jar);
		expect(jar.deletes).toEqual([
			{ name: 'lyriks_session', opts: { path: '/' } },
			{ name: 'lyriks_session', opts: { path: '/', domain: 'lyriks.example.test' } }
		]);
	});
});
