import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import { blockedChangeMessage, enforceTrustedOrigin } from './csrf.server';

function event(method: string, headers: HeadersInit = {}): RequestEvent {
	return {
		url: new URL('https://lyriks.internal/api/projects'),
		request: new Request('https://lyriks.internal/api/projects', { method, headers })
	} as RequestEvent;
}

/** The refusal the check throws, or null when it lets the request through. */
function refusal(e: RequestEvent): { status: number; message: string } | null {
	try {
		enforceTrustedOrigin(e);
		return null;
	} catch (failure) {
		if (!isHttpError(failure)) throw failure;
		return { status: failure.status, message: failure.body.message };
	}
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('enforceTrustedOrigin', () => {
	afterEach(() => { delete mockEnv.LYRIKS_TRUSTED_ORIGINS; });

	it('allows a same-origin state-changing request by default', () => {
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'https://lyriks.internal' }))
		).not.toThrow();
	});

	it('rejects a cross-origin state-changing request without operator configuration', () => {
		expect(() => enforceTrustedOrigin(event('POST', { origin: 'https://attacker.example' }))).toThrow();
	});

	it('rejects cross-site browser metadata when Origin is missing', () => {
		expect(() => enforceTrustedOrigin(event('DELETE', { 'sec-fetch-site': 'cross-site' }))).toThrow();
	});

	it('keeps trusting the request\'s own origin beside a configured allowlist', () => {
		// The behaviour dashboard reaches the platform on its internal service name
		// while the appliance lists only its public origin.
		mockEnv.LYRIKS_TRUSTED_ORIGINS = 'https://lyriks.example, https://www.lyriks.example/';
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'https://lyriks.internal' }))
		).not.toThrow();
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'https://www.lyriks.example' }))
		).not.toThrow();
		expect(() => enforceTrustedOrigin(event('POST', { origin: 'https://attacker.example' }))).toThrow();
	});

	it('trusts an Origin naming the Host the request was sent to, whatever scheme the runtime assumes', () => {
		// The appliance network speaks plain http while adapter-node assumes https.
		mockEnv.LYRIKS_TRUSTED_ORIGINS = 'https://lyriks.example';
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'http://platform:3000', host: 'platform:3000' }))
		).not.toThrow();
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'https://attacker.example', host: 'platform:3000' }))
		).toThrow();
		expect(() =>
			enforceTrustedOrigin(event('POST', { origin: 'null', host: 'platform:3000' }))
		).toThrow();
	});

	it('does not apply to safe methods', () => {
		expect(() => enforceTrustedOrigin(event('GET', { origin: 'https://attacker.example' }))).not.toThrow();
	});
});

describe('a blocked change says why and what to do', () => {
	it('names the address the form came from, the one it reached, and what to do [criterion:02e6912b]', () => {
		const blocked = refusal(event('POST', { origin: 'https://attacker.example', host: 'lyriks.internal' }));
		expect(blocked?.status).toBe(403);
		expect(blocked?.message).toBe(
			'Cross-origin request blocked. This form was sent from https://attacker.example, but it reached this installation as' +
				' lyriks.internal. Lyriks accepts a change only from its own address, so that no other site can act in your name.' +
				' Open the installation at its own address in an ordinary browser, then send the form again. If' +
				' https://attacker.example is an address of this installation, its operator adds it to LYRIKS_TRUSTED_ORIGINS or' +
				' has the reverse proxy forward the Host header.'
		);
	});

	it('logs one line for the operator with the method, the path and both addresses [criterion:02e6912b]', () => {
		refusal(event('POST', { origin: 'https://attacker.example', host: 'lyriks.internal' }));
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('cross-origin request blocked: POST /api/projects from https://attacker.example to lyriks.internal');
	});

	it('says the browser marked it cross-site when no origin came, and offers no address to trust [criterion:02e6912b]', () => {
		const blocked = refusal(event('DELETE', { 'sec-fetch-site': 'cross-site', host: 'lyriks.internal' }));
		expect(blocked?.status).toBe(403);
		expect(blocked?.message).toContain('Your browser marked this form as sent from another site, and it reached this installation as lyriks.internal.');
		expect(blocked?.message).not.toContain('LYRIKS_TRUSTED_ORIGINS');
		expect(warn).toHaveBeenCalledWith('cross-origin request blocked: DELETE /api/projects from no Origin, marked cross-site to lyriks.internal');
	});

	it('says the browser hid the address of an opaque origin, which no operator can trust [criterion:02e6912b]', () => {
		const message = blockedChangeMessage('null', 'platform:3000');
		expect(message).toContain('This form was sent from a page whose address the browser hides, and it reached this installation as platform:3000.');
		expect(message).not.toContain('LYRIKS_TRUSTED_ORIGINS');
	});

	it('names the address the request was sent to when no Host header came', () => {
		expect(refusal(event('POST', { origin: 'https://attacker.example' }))?.message).toContain('reached this installation as lyriks.internal.');
	});

	it('keeps a long origin to one line on the page and in the log', () => {
		const long = 'https://' + 'a'.repeat(400) + '.example';
		const message = blockedChangeMessage(long, 'lyriks.internal');
		expect(message).toContain(long.slice(0, 200) + '...');
		expect(message).not.toContain(long);
	});
});
