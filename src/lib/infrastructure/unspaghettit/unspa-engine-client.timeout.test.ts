import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The engine explores state space in a synchronous loop, so the MCP
 * cancellation the SDK sends when a call times out is only read once that loop
 * ends: an abandoned call keeps a core busy long after the caller gave up, and
 * every later call queues behind it. A deadline therefore has to DROP the
 * subprocess, not just stop waiting for it.
 */

const { clients, callToolImpl, connectImpl } = vi.hoisted(() => ({
	connectImpl: { fn: async () => {} },
	clients: [] as Array<{ close: ReturnType<typeof vi.fn>; onclose: (() => void) | null }>,
	callToolImpl: {
		fn: (_args: { name: string }, _schema: unknown, _options?: { timeout?: number }) =>
			({}) as unknown
	}
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		onclose: (() => void) | null = null;
		close = vi.fn();
		constructor() {
			clients.push(this);
		}
		async connect() { await connectImpl.fn(); }
		callTool(args: { name: string }, schema: unknown, options?: { timeout?: number }) {
			return callToolImpl.fn(args, schema, options);
		}
		readResource(_args: { uri: string }, options?: { timeout?: number }) {
			return callToolImpl.fn({ name: 'read_resource' }, undefined, options);
		}
	}
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
	StdioClientTransport: class {
		constructor(_cfg: unknown) {}
	}
}));

import { DEFAULT_CALL_TIMEOUT_MS, isRequestTimeout, UnspaEngineClient } from './unspa-engine-client.server';
import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';

/** What the SDK raises locally when the caller's deadline passes. */
const timeoutError = () => Object.assign(new Error('Request timed out'), { code: -32001 });

const client = () =>
	new UnspaEngineClient({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' });

describe('isRequestTimeout', () => {
	it('recognises the SDK deadline by code and by message', () => {
		expect(isRequestTimeout(timeoutError())).toBe(true);
		expect(isRequestTimeout(new Error('Request timed out'))).toBe(true);
		expect(isRequestTimeout(new Error('Feature not found'))).toBe(false);
		expect(isRequestTimeout(null)).toBe(false);
	});
});

describe('UnspaEngineClient deadlines', () => {
	beforeEach(() => {
		clients.length = 0;
		connectImpl.fn = async () => {};
		callToolImpl.fn = () => ({ content: [{ type: 'text', text: '{}' }] });
	});

	it('applies the connection default when the caller names no deadline', async () => {
		const seen: Array<number | undefined> = [];
		callToolImpl.fn = (_args, _schema, options) => {
			seen.push(options?.timeout);
			return { content: [{ type: 'text', text: '{}' }] };
		};

		await client().callJson('score_feature', { featureId: 'f' });

		expect(seen).toEqual([DEFAULT_CALL_TIMEOUT_MS]);
	});

	it('lets one call carry its own deadline', async () => {
		const seen: Array<number | undefined> = [];
		callToolImpl.fn = (_args, _schema, options) => {
			seen.push(options?.timeout);
			return { content: [{ type: 'text', text: '{}' }] };
		};

		await client().callJson('model_check', { featureId: 'f' }, { timeoutMs: 1234 });

		expect(seen).toEqual([1234]);
	});

	it('drops the subprocess when a call overruns, and respawns for the next one', async () => {
		callToolImpl.fn = () => {
			throw timeoutError();
		};
		const engine = client();

		expect(await engine.callJson('model_check', { featureId: 'f' })).toBeNull();
		expect(clients).toHaveLength(1);
		expect(clients[0].close).toHaveBeenCalledTimes(1);

		callToolImpl.fn = () => ({ content: [{ type: 'text', text: '{"ok":true}' }] });
		expect(await engine.callJson('score_feature', { featureId: 'f' })).toEqual({ ok: true });
		expect(clients).toHaveLength(2); // a clean subprocess, not the starved one
	});

	it('keeps the subprocess when the engine simply answered with an error', async () => {
		callToolImpl.fn = () => {
			throw new Error('Feature f not found');
		};
		const engine = client();

		expect(await engine.callJson('score_feature', { featureId: 'f' })).toBeNull();
		expect(clients[0].close).not.toHaveBeenCalled();
	});

	it('closes a process whose handshake fails before it becomes the connected client', async () => {
		connectImpl.fn = async () => { throw new Error('handshake failed'); };
		try {
			const engine = client();
			expect(await engine.client()).toBeNull();
			expect(clients[0].close).toHaveBeenCalledTimes(1);
			expect(engine.connected).toBeNull();
		} finally {
			connectImpl.fn = async () => {};
		}
	});

	it('queues reads and writes together before starting their individual budgets', async () => {
		let release!: (value: unknown) => void;
		const calls: string[] = [];
		callToolImpl.fn = ({ name }) => {
			calls.push(name);
			return name === 'verify'
				? new Promise((resolve) => { release = resolve; })
				: { content: [{ type: 'text', text: '{"saved":true}' }] };
		};
		const engine = client();
		const read = engine.callJson('verify', {});
		const write = engine.callJsonOrError('apply_batch', {});
		await vi.waitFor(() => expect(calls).toEqual(['verify']));
		release({ content: [{ type: 'text', text: '{"passed":true}' }] });
		expect(await read).toEqual({ passed: true });
		expect(await write).toEqual({ ok: true, value: { saved: true } });
		expect(calls).toEqual(['verify', 'apply_batch']);
	});

	it('runs a queued read on a fresh process after its predecessor times out', async () => {
		callToolImpl.fn = ({ name }) => {
			if (name === 'verify') throw timeoutError();
			return { content: [{ type: 'text', text: '{"score":80}' }] };
		};
		const engine = client();
		const first = engine.callJson('verify', {});
		const next = engine.callJson('score_feature', {});
		expect(await first).toBeNull();
		expect(await next).toEqual({ score: 80 });
		expect(clients).toHaveLength(2);
		expect(clients[0].close).toHaveBeenCalledTimes(1);
		expect(clients[1].close).not.toHaveBeenCalled();
	});

	it('queues raw results and reference reads with JSON calls [criterion:8f8d58f7]', async () => {
		let release!: (value: unknown) => void;
		const calls: Array<{ name: string; timeout?: number }> = [];
		const refusal = { isError: true, content: [{ type: 'text', text: 'A precise refusal' }] };
		callToolImpl.fn = ({ name }, _schema, options) => {
			calls.push({ name, timeout: options?.timeout });
			if (name === 'verify') return new Promise((resolve) => { release = resolve; });
			if (name === 'read_resource') return { contents: [{ text: 'The full reference' }] };
			return refusal;
		};
		const engine = client();
		const first = engine.callJson('verify', {});
		const raw = engine.callTool('apply_batch', {}, { timeoutMs: 123 });
		const reference = engine.readResourceText('unspa://operations');
		await vi.waitFor(() => expect(calls.map((call) => call.name)).toEqual(['verify']));
		release({ content: [{ type: 'text', text: '{}' }] });
		await first;
		expect(await raw).toBe(refusal);
		expect(await reference).toBe('The full reference');
		expect(calls).toEqual([
			{ name: 'verify', timeout: DEFAULT_CALL_TIMEOUT_MS },
			{ name: 'apply_batch', timeout: 123 },
			{ name: 'read_resource', timeout: DEFAULT_CALL_TIMEOUT_MS }
		]);
	});

	it('queues advisor batch writes behind running calculations [criterion:8f8d58f7]', async () => {
		let release!: (value: unknown) => void;
		const calls: string[] = [];
		callToolImpl.fn = ({ name }) => {
			calls.push(name);
			return name === 'verify'
				? new Promise((resolve) => { release = resolve; })
				: { content: [{ type: 'text', text: '{"ok":true,"appliedCount":1}' }] };
		};
		const engine = client();
		const advisor = new McpUnspaghettitAdvisor({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' }, engine);
		const first = engine.callJson('verify', {});
		const save = advisor.applyBehaviorBatch('feat-x', [], { commit: 'saved-preview' });
		await vi.waitFor(() => expect(calls).toEqual(['verify']));
		release({ content: [{ type: 'text', text: '{}' }] });
		await first;
		expect(await save).toMatchObject({ ok: true, appliedCount: 1 });
		expect(calls).toEqual(['verify', 'apply_batch']);
	});

	it('recovers after a raw advisor save times out without claiming success [criterion:a856a4ef]', async () => {
		callToolImpl.fn = ({ name }) => {
			if (name === 'save_feature' || name === 'replace_project' || name === 'apply_batch') throw timeoutError();
			return { content: [{ type: 'text', text: '{"id":"feat-x","name":"Recovered","surfaces":[]}' }] };
		};
		const engine = client();
		const advisor = new McpUnspaghettitAdvisor({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' }, engine);
		expect(await advisor.saveFeatureShell({ feature: {} } as never)).toBe(false);
		expect(await advisor.replaceProject({ project: {} } as never)).toBe('unavailable');
		expect(await advisor.applyBehaviorBatch('feat-x', [])).toBeNull();
		expect(await advisor.getFeatureSummary('feat-x')).toMatchObject({ id: 'feat-x', name: 'Recovered' });
		expect(clients).toHaveLength(4);
		for (const closed of clients.slice(0, 3)) expect(closed.close).toHaveBeenCalledTimes(1);
		expect(clients[3].close).not.toHaveBeenCalled();
	});

	it.each(['Rejected', ''])('never reports a tool-error save as successful: %j [criterion:a856a4ef]', async (text) => {
		callToolImpl.fn = () => ({ isError: true, content: [{ type: 'text', text }] });
		const advisor = new McpUnspaghettitAdvisor({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' });
		expect(await advisor.saveFeatureShell({ feature: {} } as never)).toBe(false);
		expect(await advisor.replaceProject({ project: {} } as never)).toBe('unavailable');
	});
});

describe('one live engine subprocess per role', () => {
	const config = { mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' };

	it('stops the subprocess of the client it replaces, as a dev server rebuilding its services does', async () => {
		const first = new UnspaEngineClient(config, 'role-a');
		await first.client();
		const firstConnection = clients.at(-1)!;
		const second = new UnspaEngineClient(config, 'role-a');
		expect(firstConnection.close).toHaveBeenCalledTimes(1);
		expect(first.connected).toBeNull();
		await second.client();
		expect(second.connected).not.toBeNull();
	});

	it('leaves a client of another role alone', async () => {
		const lane = new UnspaEngineClient(config, 'role-lane');
		await lane.client();
		const laneConnection = clients.at(-1)!;
		new UnspaEngineClient(config, 'role-advisor');
		expect(laneConnection.close).not.toHaveBeenCalled();
		expect(lane.connected).not.toBeNull();
	});
});

describe('a client replaced while it connects', () => {
	it('stops the subprocess its connection opens, since nothing will use it', async () => {
		const config = { mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' };
		const old = new UnspaEngineClient(config, 'role-race');
		const connecting = old.client();
		new UnspaEngineClient(config, 'role-race');
		expect(await connecting).toBeNull();
		expect(clients.at(-1)!.close).toHaveBeenCalled();
		expect(old.connected).toBeNull();
	});
});

describe('a dropped subprocess never leaves another running', () => {
	const config = { mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' };

	it('stops a connection that opens after a recycle, and serves the next call from a fresh one', async () => {
		const engine = new UnspaEngineClient(config, 'role-recycle');
		const opening = engine.client();
		const stale = clients.at(-1)!;
		engine.recycle();
		const served = await opening;
		expect(stale.close).toHaveBeenCalled();
		expect(served).not.toBe(stale);
		expect(engine.connected).toBe(served);
	});

	it('keeps the current subprocess when an old one reports its close late', async () => {
		const engine = new UnspaEngineClient(config, 'role-late-close');
		await engine.client();
		const old = clients.at(-1)!;
		engine.recycle();
		const current = await engine.client();
		old.onclose?.();
		expect(engine.connected).toBe(current);
	});
});
