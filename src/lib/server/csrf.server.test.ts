import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import { enforceTrustedOrigin } from './csrf.server';

function event(method: string, headers: HeadersInit = {}): RequestEvent {
	return {
		url: new URL('https://lyriks.internal/api/projects'),
		request: new Request('https://lyriks.internal/api/projects', { method, headers })
	} as RequestEvent;
}

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
