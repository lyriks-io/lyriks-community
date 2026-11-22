import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { LicenseEntitlements, LicenseView } from '$domain/licensing';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { installHolders, isAdmin, requireAdmin } from './admin.server';

/**
 * Who administers the installation: anyone with sign-in off, else an address on
 * the LYRIKS_ADMIN_EMAILS allowlist or the address the licence was issued to.
 */

function licence(binding: Pick<LicenseEntitlements, 'customer'> & Partial<Pick<LicenseEntitlements, 'email'>>): LicenseView {
	return {
		status: 'active',
		entitlements: { licenseId: 'lic', edition: 'enterprise', seats: 3, issuedAt: '2026-01-01T00:00:00Z', expiresAt: null, ...binding },
		daysRemaining: null,
		activatedAt: '2026-01-01T00:00:00Z'
	};
}

function caller(email: string | undefined, opts: { authRequired?: boolean; license?: LicenseView | null } = {}) {
	return {
		locals: {
			authRequired: opts.authRequired ?? true,
			session: { isAuthenticated: email !== undefined, email },
			license: opts.license ?? null
		} satisfies Pick<App.Locals, 'authRequired' | 'session' | 'license'> as App.Locals
	};
}

function refusal(event: ReturnType<typeof caller>): { status: number; message: string } | null {
	try {
		requireAdmin(event);
		return null;
	} catch (failure) {
		if (isHttpError(failure)) return { status: failure.status, message: failure.body.message };
		throw failure;
	}
}

afterEach(() => {
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('who administers the installation', () => {
	it('is anyone while sign-in is off: the single trusted user', () => {
		expect(isAdmin(caller(undefined, { authRequired: false }))).toBe(true);
		expect(refusal(caller(undefined, { authRequired: false }))).toBeNull();
	});

	it('is an allowlisted address, whatever its case or the spaces around it', () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ' ops@example.test , Root@Example.test ';
		expect(isAdmin(caller('root@example.TEST'))).toBe(true);
		expect(isAdmin(caller('ops@example.test'))).toBe(true);
		expect(refusal(caller('root@example.test'))).toBeNull();
	});

	it('is not a signed-in member off the allowlist, who is told an admin account is required', () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = 'root@example.test';
		expect(isAdmin(caller('member@example.test'))).toBe(false);
		const refused = refusal(caller('member@example.test'));
		expect(refused?.status).toBe(403);
		expect(refused?.message).toContain('requires an admin account');
		expect(refused?.message).not.toContain('LYRIKS_ADMIN_EMAILS');
	});

	it('is nobody without an address, even with an empty allowlist entry', () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ',';
		expect(isAdmin(caller(undefined))).toBe(false);
		expect(isAdmin(caller(''))).toBe(false);
	});

	it('refuses with the setting to change when no administrator is configured at all', () => {
		const refused = refusal(caller('member@example.test'));
		expect(refused?.status).toBe(403);
		expect(refused?.message).toContain('set LYRIKS_ADMIN_EMAILS to enable');
	});

	it('is the holder the licence names in its signed claim', () => {
		const key = licence({ customer: 'Acme', email: 'holder@example.test' });
		expect(isAdmin(caller('Holder@example.test', { license: key }))).toBe(true);
		expect(isAdmin(caller('other@example.test', { license: key }))).toBe(false);
	});

	it('is the holder an older key names in its customer label', () => {
		const key = licence({ customer: 'Ada Lovelace <ada@example.test>' });
		expect(isAdmin(caller('ada@example.test', { license: key }))).toBe(true);
	});

	it('is nobody by licence when the key names an organisation, not an address', () => {
		const key = licence({ customer: 'Acme Corp' });
		expect(isAdmin(caller('acme@example.test', { license: key }))).toBe(false);
		expect(refusal(caller('acme@example.test', { license: key }))?.status).toBe(403);
	});
});

describe('the holders of the installation', () => {
	it('are the allowlisted administrators and the licence holder', () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = 'root@example.test';
		const key = licence({ customer: 'Acme', email: 'holder@example.test' });
		expect(installHolders(caller('x@example.test', { license: key }))).toEqual(['root@example.test', 'holder@example.test']);
		expect(installHolders(caller('x@example.test'))).toEqual(['root@example.test']);
	});
});
