import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression: a failed `apply_batch` that POISONS the warm engine subprocess
 * (every later read returns "not found") must recycle the subprocess so the next
 * call respawns a clean index — instead of the whole engine staying dead until a
 * platform restart. A clean validation rejection (feature still resolves) must
 * NOT recycle.
 */

const { clients, callToolImpl } = vi.hoisted(() => ({
	clients: [] as Array<{ close: ReturnType<typeof vi.fn>; onclose: (() => void) | null }>,
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
		callTool(args: { name: string; arguments?: unknown }) {
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

const text = (t: string) => ({ content: [{ type: 'text', text: t }] });
const featureJson = (id: string) => text(JSON.stringify({ id, name: id, surfaces: [] }));
const notFound = (id: string) => text(`Feature ${id} not found`);
const rejected = (id: string) => ({ ...notFound(id), isError: true });

function makeAdvisor() {
	// mcpBinPath must pass existsSync; process.execPath (the node binary) always exists.
	return new McpUnspaghettitAdvisor({ mcpBinPath: process.execPath, snapshotsRoot: '/tmp/x' });
}

describe('McpUnspaghettitAdvisor engine self-heal', () => {
	beforeEach(() => {
		clients.length = 0;
		callToolImpl.fn = () => ({});
	});

	it('recycles the subprocess when a failed batch poisoned feature resolution', async () => {
		// apply_batch is rejected AND the probe read now misses → engine is poisoned.
		callToolImpl.fn = ({ name }) =>
			name === 'apply_batch' ? rejected('feat-x') : notFound('feat-x');

		const advisor = makeAdvisor();
		const res = await advisor.applyBehaviorBatch('feat-x', [{ kind: 'add_event' }], { dryRun: true });

		expect(res?.ok).toBe(false);
		expect(clients).toHaveLength(1); // one engine spawned
		expect(clients[0].close).toHaveBeenCalledTimes(1); // …and recycled after the poisoning

		// Next call transparently respawns a fresh engine (index rebuilt from disk).
		callToolImpl.fn = () => featureJson('feat-x');
		await advisor.getFeatureSummary('feat-x');
		expect(clients).toHaveLength(2);
	});

	it('does NOT recycle on an ordinary rejection where the feature still resolves', async () => {
		// Batch rejected, but the feature is still resolvable → clean validation error.
		callToolImpl.fn = ({ name }) =>
			name === 'apply_batch' ? rejected('feat-x') : featureJson('feat-x');

		const advisor = makeAdvisor();
		const res = await advisor.applyBehaviorBatch('feat-x', [{ kind: 'add_action' }], { dryRun: true });

		expect(res?.ok).toBe(false);
		expect(clients).toHaveLength(1);
		expect(clients[0].close).not.toHaveBeenCalled(); // warm engine kept

		// Subsequent call reuses the same warm client (no respawn).
		callToolImpl.fn = () => featureJson('feat-x');
		await advisor.getFeatureSummary('feat-x');
		expect(clients).toHaveLength(1);
	});

	it('does not probe/recycle on a commit replay (no featureId to check)', async () => {
		callToolImpl.fn = ({ name }) => (name === 'apply_batch' ? rejected('') : notFound(''));
		const advisor = makeAdvisor();
		await advisor.applyBehaviorBatch('', [], { commit: 'token-123' });
		expect(clients).toHaveLength(1);
		expect(clients[0].close).not.toHaveBeenCalled();
	});
});

describe('McpUnspaghettitAdvisor digest de-duplication', () => {
	beforeEach(() => {
		clients.length = 0;
		callToolImpl.fn = () => ({});
	});

	it('folds the engine\'s repeated "Where you can go" lines to one', async () => {
		const markdown =
			'## Where you can go\n' +
			'- Manage tasks to another surface\n'.repeat(5) +
			'\n## What you can do here\n- Create\n- Create\n';
		callToolImpl.fn = () => text(JSON.stringify({ hasContent: true, markdown }));
		const advisor = makeAdvisor();
		const digest = await advisor.getDigest('feat-x');
		const nav = digest!.markdown.match(/Manage tasks to another surface/g) ?? [];
		expect(nav).toHaveLength(1); // 5 identical bullets → 1
		// distinct lines are preserved; only adjacent identical ones fold
		expect(digest!.markdown).toContain('## What you can do here');
		expect((digest!.markdown.match(/- Create/g) ?? []).length).toBe(1);
	});
});
