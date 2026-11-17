import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

/** The role gate the composition root hands out: a stub whose verdict each test sets. */
const gate = vi.hoisted(() => ({ allows: vi.fn(async (_token: unknown, _door: unknown, _workspaceId: unknown) => false) }));
/** The workspace each project is registered in on the team server; absent: it belongs to none. */
const owners = vi.hoisted(() => ({ 'p-owned': 'ws-owning', 'p-owned-2': 'ws-owning', 'p-elsewhere': 'ws-other' }) as Record<string, string>);
const backLinks = vi.hoisted(() => ({ find: async (id: string) => (owners[id] ? { backWorkspaceId: owners[id] } : null) }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ roleGate: gate, backLinks }) }));
import { getServices } from '$composition/container.server';

import { callerCanWrite, callerCanWriteEach, tokenHasRole } from './writer-gate.server';

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
		await expect(tokenHasRole(getServices(), 'viewer', 'write', 'ws-a')).resolves.toBe(false);
		expect(gate.allows).toHaveBeenCalled();
	});
	it('says yes without asking anyone when auth is off', async () => {
		mockEnv.LYRIKS_AUTH_REQUIRED = undefined;
		await expect(tokenHasRole(getServices(), null, 'write', null)).resolves.toBe(true);
		expect(gate.allows).not.toHaveBeenCalled();
	});

	it('hands the token, the door and the active workspace to the gate and returns its verdict', async () => {
		gate.allows.mockResolvedValueOnce(true);
		await expect(tokenHasRole(getServices(), 'jwt-1', 'mcp', 'ws-a')).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-1', 'mcp', 'ws-a');
		await expect(tokenHasRole(getServices(), 'jwt-2', 'write', null)).resolves.toBe(false);
	});
});

describe('callerCanWrite', () => {
	const cookies = new Map<string, string>([
		['lyriks_session', 'jwt-8'],
		['lyriks_active_ws', 'ws-a']
	]);
	const event = (authRequired: boolean) => ({
		locals: { authRequired, services: getServices() },
		cookies: { get: (name: string) => cookies.get(name) }
	});

	it('is a no-op yes when auth is off', async () => {
		await expect(callerCanWrite(event(false) as never)).resolves.toBe(true);
		expect(gate.allows).not.toHaveBeenCalled();
	});

	it('asks the gate for the write door with the session cookie and the active workspace when no project is named', async () => {
		gate.allows.mockResolvedValueOnce(true);
		await expect(callerCanWrite(event(true) as never)).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-8', 'write', 'ws-a');
	});

	it('judges a project in the workspace that owns it, never in the one the switcher shows', async () => {
		gate.allows.mockImplementation(async (_token, _door, workspaceId) => workspaceId === 'ws-owning');
		await expect(callerCanWrite(event(true) as never, 'p-owned')).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-8', 'write', 'ws-owning');
		expect(gate.allows).not.toHaveBeenCalledWith('jwt-8', 'write', 'ws-a');
	});

	it('refuses a viewer of the owning workspace even when they write in the active one', async () => {
		gate.allows.mockImplementation(async (_token, _door, workspaceId) => workspaceId === 'ws-a');
		await expect(callerCanWrite(event(true) as never, 'p-owned')).resolves.toBe(false);
	});

	it('reads the active workspace for a project that belongs to none', async () => {
		gate.allows.mockResolvedValueOnce(true);
		await expect(callerCanWrite(event(true) as never, 'p-unregistered')).resolves.toBe(true);
		expect(gate.allows).toHaveBeenCalledWith('jwt-8', 'write', 'ws-a');
	});
});

describe('callerCanWriteEach', () => {
	const cookies = new Map<string, string>([
		['lyriks_session', 'jwt-8'],
		['lyriks_active_ws', 'ws-a']
	]);
	const event = (authRequired: boolean) => ({
		locals: { authRequired, services: getServices() },
		cookies: { get: (name: string) => cookies.get(name) }
	});

	it('says yes for every project without asking anyone when auth is off', async () => {
		const each = await callerCanWriteEach(event(false) as never, ['p-owned', 'p-elsewhere']);
		expect([...each]).toEqual([['p-owned', true], ['p-elsewhere', true]]);
		expect(gate.allows).not.toHaveBeenCalled();
	});

	it('judges each project in the workspace that owns it, never in the one the switcher shows', async () => {
		// A writer in the owning workspace, a viewer in another and in the active one.
		gate.allows.mockImplementation(async (_token, _door, workspaceId) => workspaceId === 'ws-owning');
		const each = await callerCanWriteEach(event(true) as never, ['p-owned', 'p-elsewhere', 'p-unregistered']);
		expect(each.get('p-owned')).toBe(true);
		expect(each.get('p-elsewhere')).toBe(false);
		// A project of no workspace reads the active one.
		expect(each.get('p-unregistered')).toBe(false);
		expect(gate.allows).toHaveBeenCalledWith('jwt-8', 'write', 'ws-a');
	});

	it('asks the gate once per workspace, not once per project', async () => {
		gate.allows.mockResolvedValue(true);
		const each = await callerCanWriteEach(event(true) as never, ['p-owned', 'p-owned-2', 'p-elsewhere']);
		expect([...each.values()]).toEqual([true, true, true]);
		expect(gate.allows).toHaveBeenCalledTimes(2);
		expect(gate.allows.mock.calls.map((call) => call[2]).sort()).toEqual(['ws-other', 'ws-owning']);
	});
});
