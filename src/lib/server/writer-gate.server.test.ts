import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

/** The role gate the composition root hands out: a stub whose verdict each test sets. */
const gate = vi.hoisted(() => ({ allows: vi.fn(async () => false) }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ roleGate: gate }) }));

import { callerCanWrite, tokenHasRole } from './writer-gate.server';

beforeEach(() => {
	gate.allows.mockReset();
	gate.allows.mockResolvedValue(false);
	mockEnv.LYRIKS_AUTH_REQUIRED = '1';
});

afterEach(() => {
	delete mockEnv.LYRIKS_AUTH_REQUIRED;
	delete mockEnv.LYRIKS_EDITION;
	vi.unstubAllEnvs();
});

describe('tokenHasRole', () => {
	it('enforces edition-based production authentication without the legacy flag', async () => {
		vi.stubEnv('DEV', false);
		mockEnv.LYRIKS_EDITION = 'enterprise';
		delete mockEnv.LYRIKS_AUTH_REQUIRED;
		await expect(tokenHasRole('viewer', 'write', 'ws-a')).resolves.toBe(false);
		expect(gate.allows).toHaveBeenCalled();
	});
	it('says yes without asking anyone when auth is off', async () => {
		mockEnv.LYRIKS_AUTH_REQUIRED = undefined;
		await expect(tokenHasRole(null, 'write', null)).resolves.toBe(true);
		expect(gate.allows).not.toHaveBeenCalled();
	});

	it('hands the token, the door and the active workspace to the gate and returns its verdict', async () => {
		gate.allows.mockResolvedValueOnce(true);
		await expect(tokenHasRole('jwt-1', 'mcp', 'ws-a')).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-1', 'mcp', 'ws-a');
		await expect(tokenHasRole('jwt-2', 'write', null)).resolves.toBe(false);
	});
});

describe('callerCanWrite', () => {
	const cookies = new Map<string, string>([
		['lyriks_session', 'jwt-8'],
		['lyriks_active_ws', 'ws-a']
	]);
	const event = (authRequired: boolean) => ({
		locals: { authRequired },
		cookies: { get: (name: string) => cookies.get(name) }
	});

	it('is a no-op yes when auth is off', async () => {
		await expect(callerCanWrite(event(false) as never)).resolves.toBe(true);
		expect(gate.allows).not.toHaveBeenCalled();
	});

	it('asks the gate for the write door with the session cookie and the active workspace', async () => {
		gate.allows.mockResolvedValueOnce(true);
		await expect(callerCanWrite(event(true) as never)).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-8', 'write', 'ws-a');
	});
});
