import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
/** The role gate the composition root hands out: a designer token passes, a viewer's does not. */
vi.mock('$composition/container.server', () => ({
	getServices: () => ({ roleGate: { allows: async (token: string) => token === 'jwt-designer' } })
}));

import { isMcpPath, proxyToMcp } from './mcp-proxy.server';

function event(path: string, init: RequestInit = {}): RequestEvent {
	const url = new URL(`https://lyriks.internal${path}`);
	return { url, request: new Request(url, init) } as RequestEvent;
}

describe('isMcpPath', () => {
	it('claims the endpoint and everything the gateway hangs off it', () => {
		expect(isMcpPath('/mcp')).toBe(true);
		expect(isMcpPath('/mcp/oauth/authorize')).toBe(true);
		expect(isMcpPath('/.well-known/oauth-protected-resource')).toBe(true);
		expect(isMcpPath('/.well-known/oauth-protected-resource/mcp')).toBe(true);
		expect(isMcpPath('/.well-known/oauth-authorization-server')).toBe(true);
	});

	it('leaves app paths alone, including ones that merely start with the same letters', () => {
		expect(isMcpPath('/')).toBe(false);
		expect(isMcpPath('/api/projects')).toBe(false);
		expect(isMcpPath('/mcp-settings')).toBe(false);
		expect(isMcpPath('/.well-known/acme-challenge/token')).toBe(false);
	});
});

describe('proxyToMcp', () => {
	it('forwards method, path, query and the session cookie to the gateway', async () => {
		const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
		await proxyToMcp(
			event('/mcp/oauth/authorize?state=abc', { headers: { cookie: 'lyriks_session=jwt' } }),
			'http://mcp:3055',
			fetchImpl as unknown as typeof fetch
		);

		const [target, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
		expect(target.toString()).toBe('http://mcp:3055/mcp/oauth/authorize?state=abc');
		expect(init.method).toBe('GET');
		expect(new Headers(init.headers).get('cookie')).toBe('lyriks_session=jwt');
	});

	it('drops hop-by-hop headers instead of passing them on', async () => {
		const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
		await proxyToMcp(
			event('/mcp', { method: 'POST', headers: { connection: 'keep-alive' }, body: '{}' }),
			'http://mcp:3055',
			fetchImpl as unknown as typeof fetch
		);

		const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
		expect(new Headers(init.headers).has('connection')).toBe(false);
	});

	it('returns the redirect that starts the OAuth login rather than following it', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(null, { status: 302, headers: { location: '/login?redirect=%2Fmcp' } })
		);
		const res = await proxyToMcp(
			event('/mcp/oauth/authorize'),
			'http://mcp:3055',
			fetchImpl as unknown as typeof fetch
		);

		const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
		expect(init.redirect).toBe('manual');
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/login?redirect=%2Fmcp');
	});

	it('keeps the challenge that tells an MCP client where to authenticate', async () => {
		const challenge = 'Bearer resource_metadata="https://lyriks.internal/.well-known/oauth-protected-resource"';
		const fetchImpl = vi.fn(
			async () => new Response('{}', { status: 401, headers: { 'www-authenticate': challenge } })
		);
		const res = await proxyToMcp(
			event('/mcp', { method: 'POST', body: '{}' }),
			'http://mcp:3055',
			fetchImpl as unknown as typeof fetch
		);

		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe(challenge);
	});

	it('answers 502 when the gateway is down, instead of a stack trace', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error('ECONNREFUSED');
		});
		const res = await proxyToMcp(
			event('/mcp', { method: 'POST', body: '{}' }),
			'http://mcp:3055',
			fetchImpl as unknown as typeof fetch
		);

		expect(res.status).toBe(502);
		await expect(res.json()).resolves.toEqual({ error: 'mcp_unavailable' });
	});
});

describe('proxyToMcp refuses a reader', () => {
	/** A gateway that answers 200; the role itself is judged by the mocked gate above. */
	function world(_role: string) {
		return vi.fn(async () => new Response('{"jsonrpc":"2.0"}', { status: 200 })) as unknown as typeof fetch;
	}

	beforeEach(() => {
		mockEnv.LYRIKS_AUTH_REQUIRED = '1';
	});

	afterEach(() => {
		delete mockEnv.LYRIKS_AUTH_REQUIRED;
	});

	it('leaves opaque token validation to the gateway, which checks the backing session', async () => {
		const fetchImpl = world('viewer');
		const res = await proxyToMcp(
			event('/mcp', { method: 'POST', headers: { authorization: 'Bearer lyriks_mcp_opaque' }, body: '{}' }),
			'http://mcp:3055', fetchImpl
		);
		expect(res.status).toBe(200);
		expect(fetchImpl).toHaveBeenCalled();
	});

	it('forwards a designer bearer token to the gateway', async () => {
		const fetchImpl = world('designer');
		const res = await proxyToMcp(
			event('/mcp', { method: 'POST', headers: { authorization: 'Bearer jwt-designer' }, body: '{}' }),
			'http://mcp:3055',
			fetchImpl
		);
		expect(res.status).toBe(200);
		const targets = (fetchImpl as unknown as { mock: { calls: [URL | string][] } }).mock.calls.map(
			([t]) => String(t)
		);
		expect(targets).toEqual(['http://mcp:3055/mcp']);
	});

	it('leaves a call without a token to the gateway, whose challenge names the sign-in', async () => {
		const fetchImpl = world('viewer');
		const res = await proxyToMcp(event('/mcp', { method: 'POST', body: '{}' }), 'http://mcp:3055', fetchImpl);
		expect(res.status).toBe(200);
		expect(String((fetchImpl as unknown as { mock: { calls: [URL | string][] } }).mock.calls[0][0])).toBe(
			'http://mcp:3055/mcp'
		);
	});

	it("refuses a viewer's session on the authorization page before a token is minted", async () => {
		const fetchImpl = world('viewer');
		const res = await proxyToMcp(
			event('/mcp/oauth/authorize?state=abc', { headers: { cookie: 'lyriks_session=jwt-viewer' } }),
			'http://mcp:3055',
			fetchImpl
		);
		expect(res.status).toBe(403);
		expect(await res.text()).toContain('designers and above');
	});

	it('still lets an anonymous browser reach the authorization page (it redirects to /login)', async () => {
		const fetchImpl = world('viewer');
		const res = await proxyToMcp(event('/mcp/oauth/authorize'), 'http://mcp:3055', fetchImpl);
		expect(res.status).toBe(200);
		expect(String((fetchImpl as unknown as { mock: { calls: [URL | string][] } }).mock.calls[0][0])).toBe(
			'http://mcp:3055/mcp/oauth/authorize'
		);
	});

	it('never judges discovery, registration or the token exchange', async () => {
		for (const path of ['/.well-known/oauth-authorization-server', '/mcp/oauth/register', '/mcp/oauth/token']) {
			const fetchImpl = world('viewer');
			const res = await proxyToMcp(
				event(path, { method: path === '/mcp/oauth/register' || path === '/mcp/oauth/token' ? 'POST' : 'GET', headers: { cookie: 'lyriks_session=jwt-viewer', authorization: 'Bearer jwt-viewer' }, body: path.startsWith('/.well') ? undefined : '{}' }),
				'http://mcp:3055',
				fetchImpl
			);
			expect(res.status).toBe(200);
		}
	});
});
