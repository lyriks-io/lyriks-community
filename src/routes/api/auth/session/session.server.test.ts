import { describe, expect, it, vi } from 'vitest';

/** The composition root, with an identity provider and a role gate each test sets. */
const services = vi.hoisted(() => ({
	identity: { verify: vi.fn() },
	roleGate: { verdict: vi.fn() }
}));
vi.mock('$composition/container.server', () => ({ getServices: () => services }));

import { GET } from './+server';

type Event = Parameters<typeof GET>[0];
const request = (token?: string) =>
	({ cookies: { get: () => token } }) as unknown as Event;

async function status(token?: string): Promise<number> {
	try {
		return (await GET(request(token))).status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe('GET /api/auth/session (the MCP gateway session check)', () => {
	it('answers the account id when the session and the mcp role hold', async () => {
		services.identity.verify.mockResolvedValue({ id: 'u1' });
		services.roleGate.verdict.mockResolvedValue('allowed');
		const res = await GET(request('jwt'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: 'u1' });
	});

	it('gives a verdict only when the account service gave one', async () => {
		expect(await status(undefined)).toBe(401);
		services.identity.verify.mockResolvedValue(null);
		expect(await status('jwt')).toBe(401);
		services.identity.verify.mockResolvedValue({ id: 'u1' });
		services.roleGate.verdict.mockResolvedValue('denied');
		expect(await status('jwt')).toBe(403);
	});

	it('answers 503, never 401, when the account service cannot answer', async () => {
		services.identity.verify.mockResolvedValue('unreachable');
		expect(await status('jwt')).toBe(503);
		services.identity.verify.mockResolvedValue({ id: 'u1' });
		services.roleGate.verdict.mockResolvedValue('unreachable');
		expect(await status('jwt')).toBe(503);
	});
});
