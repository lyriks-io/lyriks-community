import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The engine explores state space in a synchronous loop, so the MCP
 * cancellation the SDK sends when a call times out is only read once that loop
 * ends: an abandoned call keeps a core busy long after the caller gave up, and
 * every later call queues behind it. A deadline therefore has to DROP the
 * subprocess, not just stop waiting for it.
 */

const { clients, callToolImpl } = vi.hoisted(() => ({
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
		async connect() {}
		callTool(args: { name: string }, schema: unknown, options?: { timeout?: number }) {
			return callToolImpl.fn(args, schema, options);
		}
	}
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
	StdioClientTransport: class {
		constructor(_cfg: unknown) {}
	}
}));

import { DEFAULT_CALL_TIMEOUT_MS, isRequestTimeout, UnspaEngineClient } from './unspa-engine-client.server';

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
});
