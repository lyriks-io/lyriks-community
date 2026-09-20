import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A batch may name the feature version it was written against. The engine argument
 * is newer than the engine the platform ships, so it is sent only when the caller
 * gave one, and a conflict answer must come back structured (never flattened into
 * a message, never `ok`), whichever way the engine flags it.
 */

const { clients, calls, callToolImpl } = vi.hoisted(() => ({
	clients: [] as Array<{ close: ReturnType<typeof vi.fn> }>,
	calls: [] as Array<{ name: string; arguments?: Record<string, unknown> }>,
	callToolImpl: { fn: (_args: { name: string; arguments?: unknown }) => ({}) as unknown }
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		onclose: (() => void) | null = null;
		close = vi.fn();
		constructor() {
			clients.push(this);
		}
		async connect() {}
		callTool(args: { name: string; arguments?: Record<string, unknown> }) {
			calls.push(args);
			return callToolImpl.fn(args);
		}
	}
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
	StdioClientTransport: class {
		constructor(_cfg: unknown) {}
	}
}));

import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';

const text = (payload: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
const STAMP = '2026-09-20T10:00:00.000Z';

function makeAdvisor() {
	return new McpUnspaghettitAdvisor({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' });
}

const batchArgs = () => calls.find((c) => c.name === 'apply_batch')?.arguments ?? {};

describe('McpUnspaghettitAdvisor versioned batch', () => {
	beforeEach(() => {
		clients.length = 0;
		calls.length = 0;
		callToolImpl.fn = () => text({ ok: true, appliedCount: 1, refs: {} });
	});

	it('never names the argument when the caller gave no version', async () => {
		await makeAdvisor().applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], { dryRun: true });
		expect('expectedUpdatedAt' in batchArgs()).toBe(false);
	});

	it('passes the version to the engine when given', async () => {
		await makeAdvisor().applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], {
			expectedUpdatedAt: STAMP
		});
		expect(batchArgs()).toMatchObject({ featureId: 'feat-x', expectedUpdatedAt: STAMP });
	});

	it('passes the version on the commit path too, beside the token alone', async () => {
		await makeAdvisor().applyBehaviorBatch('', [], { commit: 'tok-1', expectedUpdatedAt: STAMP });
		expect(batchArgs()).toEqual({ commit: 'tok-1', expectedUpdatedAt: STAMP });
	});

	const conflict = {
		ok: false,
		conflict: true,
		expectedUpdatedAt: STAMP,
		currentUpdatedAt: '2026-09-20T10:05:00.000Z',
		changedSince: ['action:act-1'],
		changedSinceTotal: 1,
		errors: ['The feature changed since this batch was written.']
	};

	it('returns a conflict as a rejected batch with the engine answer intact under raw', async () => {
		callToolImpl.fn = () => text(conflict);
		const res = await makeAdvisor().applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], {
			expectedUpdatedAt: STAMP
		});
		expect(res?.ok).toBe(false);
		expect(res?.errors).toEqual(['The feature changed since this batch was written.']);
		expect(res?.raw).toEqual(conflict);
	});

	it('keeps a conflict structured even when the engine flags it as a tool error', async () => {
		callToolImpl.fn = () => ({ ...text(conflict), isError: true });
		const res = await makeAdvisor().applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], {
			expectedUpdatedAt: STAMP
		});
		expect(res?.ok).toBe(false);
		expect(res?.raw).toEqual(conflict);
		// No poison probe either: the only engine call is the batch itself.
		expect(calls.map((c) => c.name)).toEqual(['apply_batch']);
	});

	it('never reads a conflict as ok, and always gives it a message to show', async () => {
		callToolImpl.fn = () => text({ ok: true, conflict: true, currentUpdatedAt: STAMP });
		const res = await makeAdvisor().applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], {
			expectedUpdatedAt: STAMP
		});
		expect(res?.ok).toBe(false);
		expect(res?.errors).toHaveLength(1);
		expect(res?.errors[0]).toContain('Nothing was written');
	});
});
