import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The auth guard's answer to an unauthenticated /api/* request, which is what the
 * MCP gateway reads on every tool call through /api/auth/session. A 401 there is
 * a verdict on the session, and clients answer it by signing in again, in a
 * browser window per client process; an account service that is merely down must
 * therefore read as unavailable.
 */
const identity = vi.hoisted(() => ({ configured: true, verify: vi.fn() }));
const roleGate = vi.hoisted(() => ({ verdict: vi.fn(async () => 'allowed') }));
/** Everything the module reaches for beyond the identity provider is inert here. */
const services = vi.hoisted(() => {
	const inert: unknown = new Proxy(function () {} as unknown as Record<string, unknown>, {
		get: () => inert,
		apply: () => Promise.resolve(null)
	});
	return new Proxy({} as Record<string, unknown>, {
		get: (_t, name) => (name === 'identity' ? identity : name === 'roleGate' ? roleGate : name === 'licenseRequired' ? () => false : inert)
	});
});
vi.mock('$composition/container.server', () => ({ getServices: () => services }));
vi.mock('$lib/server/auth-policy.server', () => ({ authEnforced: () => true }));
vi.mock('$lib/server/csrf.server', () => ({ enforceTrustedOrigin: () => {} }));
vi.mock('$lib/server/mcp-proxy.server', () => ({
	isMcpPath: () => false,
	mcpTarget: () => '',
	proxyToMcp: vi.fn()
}));
vi.mock('$lib/server/unspa-proxy.server', () => ({
	editorForbidden: () => null,
	isUnspaPath: () => false,
	proxyToUnspa: vi.fn(),
	unspaTarget: () => ''
}));
vi.mock('$lib/server/shared-editor-access.server', () => ({ canUseSharedEditor: () => false }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { handle } from './hooks.server';
import { GET as inspectSession } from './routes/api/auth/session/+server';

const deleted: string[] = [];
function request(path = '/api/auth/session') {
	const url = new URL(`https://lyriks.internal${path}`);
	return {
		url,
		locals: {},
		params: {},
		request: new Request(url),
		cookies: {
			get: () => 'a-session-jwt',
			delete: (name: string) => deleted.push(name),
			set: () => {}
		}
	} as unknown as Parameters<typeof handle>[0]['event'];
}
const resolve = vi.fn(async () => new Response('page'));

beforeEach(() => {
	deleted.length = 0;
	resolve.mockClear();
	identity.verify.mockReset();
	roleGate.verdict.mockReset().mockResolvedValue('allowed');
});

describe('the auth guard on /api/*', () => {
	it('checks identity once through the real hook and introspection handler, while checking the MCP role', async () => {
		identity.verify.mockResolvedValue({ id: 'one', email: 'one@example.test', mustChangePassword: false });
		const event = request();
		const res = await handle({ event, resolve: async () => inspectSession(event as never) });
		expect(await res.json()).toEqual({ id: 'one' });
		expect(identity.verify).toHaveBeenCalledTimes(1);
		expect(roleGate.verdict).toHaveBeenCalledWith('a-session-jwt', 'mcp', null);
		expect(res.headers.get('cache-control')).toContain('no-store');
	});

	it('checks a new HTTP request again and observes a revoked session', async () => {
		identity.verify.mockResolvedValueOnce({ id: 'one', email: 'one@example.test', mustChangePassword: false }).mockResolvedValueOnce(null);
		const first = request();
		expect((await handle({ event: first, resolve: async () => inspectSession(first as never) })).status).toBe(200);
		const next = request();
		expect((await handle({ event: next, resolve: async () => inspectSession(next as never) })).status).toBe(401);
		expect(identity.verify).toHaveBeenCalledTimes(2);
		expect(roleGate.verdict).toHaveBeenCalledTimes(1);
	});

	it('does not reuse the earlier identity when a server handler changes the cookie', async () => {
		identity.verify.mockResolvedValueOnce({ id: 'one', email: 'one@example.test', mustChangePassword: false }).mockResolvedValueOnce({ id: 'two', email: 'two@example.test', mustChangePassword: false });
		const event = request();
		const res = await handle({ event, resolve: async () => {
			event.cookies.get = () => 'replacement-session';
			return inspectSession(event as never);
		} });
		expect(await res.json()).toEqual({ id: 'two' });
		expect(identity.verify).toHaveBeenCalledTimes(2);
		expect(roleGate.verdict).toHaveBeenCalledWith('replacement-session', 'mcp', null);
	});

	it('answers 503 and keeps the cookie when the account service cannot be reached', async () => {
		identity.verify.mockResolvedValue('unreachable');
		const res = await handle({ event: request(), resolve });
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: 'account service unavailable' });
		expect(res.headers.get('retry-after')).toBe('5');
		expect(deleted).toEqual([]);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('answers 401 and drops the cookie when the session is really not one', async () => {
		identity.verify.mockResolvedValue(null);
		const res = await handle({ event: request(), resolve });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'unauthenticated' });
		expect(deleted).toEqual(['lyriks_session']);
	});
});
