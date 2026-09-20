import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The scripts ship as files and are exercised as files: child processes talking
// to a tiny in-process MCP server that behaves like the gateway's Streamable
// HTTP transport (both Accept types required, JSON or SSE answers, keep-alive
// comments in the stream). Never a live endpoint.
const scriptPath = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

type Rpc = { jsonrpc: '2.0'; id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
type Seen = { message: Rpc; headers: IncomingMessage['headers'] };
type ToolHandler = (args: Record<string, unknown>) => { json?: unknown; isError?: boolean; text?: string };

const fake = {
	seen: [] as Seen[],
	mode: 'json' as 'json' | 'sse',
	sessionId: null as string | null,
	requireToken: null as string | null,
	tools: {} as Record<string, ToolHandler>
};

function reset() {
	fake.seen = [];
	fake.mode = 'json';
	fake.sessionId = null;
	fake.requireToken = null;
	fake.tools = {};
}

function answer(response: ServerResponse, message: Rpc, result: unknown) {
	const payload = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
	if (fake.mode === 'json') {
		response.writeHead(200, { 'Content-Type': 'application/json', ...(fake.sessionId ? { 'Mcp-Session-Id': fake.sessionId } : {}) });
		response.end(payload);
		return;
	}
	// What the gateway streams: a heartbeat comment first, a notification that is
	// not the answer, then the answer as one SSE event.
	response.writeHead(200, { 'Content-Type': 'text/event-stream' });
	response.write(': keep-alive\n\n');
	response.write('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n');
	response.write(': keep-alive\n\n');
	response.end(`event: message\ndata: ${payload}\n\n`);
}

function handle(request: IncomingMessage, response: ServerResponse) {
	let body = '';
	request.on('data', (chunk) => (body += chunk));
	request.on('end', () => {
		const accept = String(request.headers.accept ?? '');
		if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
			response.writeHead(406).end('Not Acceptable: Client must accept both application/json and text/event-stream');
			return;
		}
		if (fake.requireToken && request.headers.authorization !== `Bearer ${fake.requireToken}`) {
			response.writeHead(401).end('unauthorized');
			return;
		}
		const message = JSON.parse(body) as Rpc;
		fake.seen.push({ message, headers: request.headers });
		if (message.method === 'initialize') {
			return answer(response, message, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '0' } });
		}
		if (message.id === undefined) {
			response.writeHead(202).end();
			return;
		}
		const tool = fake.tools[message.params?.name ?? ''];
		if (!tool) {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: `Unknown tool ${message.params?.name}` } }));
			return;
		}
		const out = tool(message.params?.arguments ?? {});
		answer(response, message, {
			content: [{ type: 'text', text: out.text ?? JSON.stringify(out.json) }],
			...(out.isError ? { isError: true } : {})
		});
	});
}

let server: Server;
let url = '';
const dirs: string[] = [];

beforeAll(async () => {
	server = createServer(handle);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
	reset();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-mcp-scripts-'));
	dirs.push(dir);
	return dir;
}

/** Run a script without blocking this process: the fake server lives in it. */
function run(name: string, args: string[], options: { cwd?: string; stdin?: string; env?: Record<string, string> } = {}) {
	return new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
		const env = { ...process.env, ...options.env };
		if (!options.env?.LYRIKS_MCP_URL) delete env.LYRIKS_MCP_URL;
		if (!options.env?.LYRIKS_MCP_TOKEN) delete env.LYRIKS_MCP_TOKEN;
		const child = spawn('node', [scriptPath(name), ...args], { cwd: options.cwd ?? tempDir(), env });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('close', (code) => resolve({ status: code ?? 1, stdout, stderr }));
		child.stdin.end(options.stdin ?? '');
	});
}

const toolCalls = () => fake.seen.filter((entry) => entry.message.method === 'tools/call');
const argsOf = (entry: Seen) => entry.message.params?.arguments ?? {};

/** A repository with an index of two features: an action with its children each, one shared state. */
function repoWithIndex(index: Record<string, Record<string, unknown>>, projectId: string | null = 'vector-rally') {
	const dir = tempDir();
	writeFileSync(join(dir, '.unspa.json'), JSON.stringify({ format: 'unspaghettit-index', version: 1, ...(projectId ? { projectId } : {}), index }, null, 2));
	return dir;
}

const entry = (line: number, extra: Record<string, unknown> = {}) => ({ file: 'src/a.ts', line, signature: `signature at line ${line}`, ...extra });
const TWO_FEATURES = {
	'action:boost': entry(10),
	'rule:boost-needs-fuel': entry(12),
	'event:boost_applied': entry(14),
	'action:refuel': entry(40),
	'rule:refuel-in-pit': entry(42)
};
const SYNC_ANSWER = {
	ok: true,
	synced: 1,
	successes: 1,
	failures: 0,
	skipped: 7,
	orphans: { total: 0, entries: [] },
	shared: { total: 2, entries: [{ key: 'state:a' }, { key: 'state:b' }] },
	failedAcks: [],
	acks: [{ ok: true, actionId: 'boost' }],
	semantics: { synced: 'Implementation reports written.', skipped: 'Left untouched.' }
};

describe('mcp-call.mjs over the shared client', () => {
	it('initializes, confirms, calls the tool with the file arguments, and prints the JSON answer text', async () => {
		fake.sessionId = 'session-7';
		fake.requireToken = 'secret';
		fake.tools.get_section = (args) => ({ json: { echoed: args } });
		const dir = tempDir();
		writeFileSync(join(dir, 'args.json'), JSON.stringify({ project_id: 'vector-rally', section: 'features' }));

		const result = await run('mcp-call.mjs', ['get_section', 'args.json', '--url', url, '--token', 'secret'], { cwd: dir });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ echoed: { project_id: 'vector-rally', section: 'features' } });

		expect(fake.seen.map((entry) => entry.message.method)).toEqual(['initialize', 'notifications/initialized', 'tools/call']);
		for (const { headers } of fake.seen) {
			// The gateway answers 406 unless BOTH types are accepted.
			expect(headers.accept).toBe('application/json, text/event-stream');
			expect(headers['content-type']).toBe('application/json');
			expect(headers.authorization).toBe('Bearer secret');
		}
		// A stateful server's session id and the negotiated revision ride on every later request.
		expect(fake.seen[0].headers['mcp-session-id']).toBeUndefined();
		for (const later of fake.seen.slice(1)) {
			expect(later.headers['mcp-session-id']).toBe('session-7');
			expect(later.headers['mcp-protocol-version']).toBe('2025-06-18');
		}
	});

	it('reads an SSE answer past the keep-alive comments, takes stdin and the environment, and writes --out', async () => {
		fake.mode = 'sse';
		fake.tools.get_behavior_feature = () => ({ text: 'line one\nline two' });
		const dir = tempDir();
		const result = await run('mcp-call.mjs', ['get_behavior_feature', '-', '--out', 'answer.txt'], {
			cwd: dir,
			stdin: JSON.stringify({ feature_id: 'feat-boost' }),
			env: { LYRIKS_MCP_URL: url }
		});
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(readFileSync(join(dir, 'answer.txt'), 'utf8')).toBe('line one\nline two');
		expect(result.stdout).toContain('17 bytes written to answer.txt');
		expect(argsOf(toolCalls()[0])).toEqual({ feature_id: 'feat-boost' });
		// A stateless gateway hands out no session id, and none is invented.
		expect(toolCalls()[0].headers['mcp-session-id']).toBeUndefined();
	});

	it('fails in one line: no endpoint, sign-in refused, tool error, protocol error', async () => {
		const noUrl = await run('mcp-call.mjs', ['get_section']);
		expect(noUrl.status).toBe(1);
		expect(noUrl.stderr).toContain('pass --url or set LYRIKS_MCP_URL');

		fake.requireToken = 'secret';
		const refused = await run('mcp-call.mjs', ['get_section', '--url', url]);
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain('LYRIKS_MCP_TOKEN');

		fake.requireToken = null;
		fake.tools.get_section = () => ({ isError: true, text: 'Project not found' });
		const toolError = await run('mcp-call.mjs', ['get_section', '--url', url]);
		expect(toolError.status).toBe(1);
		expect(toolError.stderr).toContain('get_section failed: Project not found');

		const unknown = await run('mcp-call.mjs', ['no_such_tool', '--url', url]);
		expect(unknown.status).toBe(1);
		expect(unknown.stderr).toContain('MCP error -32602: Unknown tool no_such_tool');
	});
});

describe('sync-index.mjs', () => {
	it('sends the whole index for the project the file names, and prints counters and semantics only', async () => {
		fake.mode = 'sse';
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES);
		const result = await run('sync-index.mjs', ['--url', url], { cwd: join(dir) });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);

		const sent = argsOf(toolCalls()[0]);
		expect(sent.project_id).toBe('vector-rally');
		expect(sent.index).toEqual(TWO_FEATURES);

		const printed = JSON.parse(result.stdout);
		expect(printed.sent).toBe(5);
		expect(printed.counters).toEqual({ ok: true, synced: 1, successes: 1, failures: 0, skipped: 7, orphans: 0, shared: 2, failedAcks: 0 });
		expect(printed.semantics).toEqual(SYNC_ANSWER.semantics);
		expect(printed.acks).toBeUndefined();
		expect(printed.shared).toBeUndefined();
	});

	it('with --feature, asks the server which keys belong to the feature (following nextOffset) and sends exactly those', async () => {
		fake.tools.get_behavior_feature = (args) =>
			args.offset === 2
				? { json: { featureId: 'feat-boost', total: 4, keys: ['event:boost_applied', 'state:not.in.the.index'] } }
				: { json: { featureId: 'feat-boost', total: 4, keys: ['action:boost', 'rule:boost-needs-fuel'], nextOffset: 2 } };
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES);
		const result = await run('sync-index.mjs', ['--feature', 'feat-boost', '--url', url], { cwd: dir });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);

		expect(toolCalls().map((call) => call.message.params?.name)).toEqual([
			'get_behavior_feature',
			'get_behavior_feature',
			'sync_implementation_index'
		]);
		expect(argsOf(toolCalls()[0])).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', index_keys: true });
		expect(argsOf(toolCalls()[1])).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', index_keys: true, offset: 2 });
		// The action travels with all of its children; the other feature stays home.
		expect(Object.keys(argsOf(toolCalls()[2]).index as object)).toEqual(['action:boost', 'rule:boost-needs-fuel', 'event:boost_applied']);
		expect(JSON.parse(result.stdout)).toMatchObject({ sent: 3, feature: 'feat-boost' });
	});

	it('on a gateway without index_keys, falls back to featureId only when EVERY entry carries one', async () => {
		// An older gateway ignores the option and answers the feature itself.
		fake.tools.get_behavior_feature = () => ({ json: { id: 'feat-boost', name: 'Boost', surfaces: [] } });
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });

		const tagged = Object.fromEntries(
			Object.entries(TWO_FEATURES).map(([key, value]) => [key, { ...value, featureId: key.includes('boost') ? 'feat-boost' : 'feat-refuel' }])
		);
		const ok = await run('sync-index.mjs', ['--feature', 'feat-refuel', '--project', 'other-project', '--url', url], { cwd: repoWithIndex(tagged) });
		expect(ok.status).toBe(0);
		const sent = argsOf(toolCalls().at(-1)!);
		expect(sent.project_id).toBe('other-project');
		expect(Object.keys(sent.index as object)).toEqual(['action:refuel', 'rule:refuel-in-pit']);

		// One entry without the field and the slice cannot be trusted: refuse, send nothing.
		fake.seen = [];
		const partial = { ...tagged, 'state:fuel.level': entry(70) };
		const refused = await run('sync-index.mjs', ['--feature', 'feat-refuel', '--url', url], { cwd: repoWithIndex(partial) });
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain('Update the Lyriks gateway, or run without --feature');
		expect(toolCalls().map((call) => call.message.params?.name)).toEqual(['get_behavior_feature']);
	});

	it('refuses an empty slice and a missing project, and fails the run when the answer is not ok', async () => {
		fake.tools.get_behavior_feature = () => ({ json: { featureId: 'feat-none', total: 0, keys: [] } });
		const empty = await run('sync-index.mjs', ['--feature', 'feat-none', '--url', url], { cwd: repoWithIndex(TWO_FEATURES) });
		expect(empty.status).toBe(1);
		expect(empty.stderr).toContain('belongs to feature feat-none');

		const noProject = await run('sync-index.mjs', ['--url', url], { cwd: repoWithIndex(TWO_FEATURES, null) });
		expect(noProject.status).toBe(1);
		expect(noProject.stderr).toContain('pass --project');

		fake.tools.sync_implementation_index = () => ({
			json: { ...SYNC_ANSWER, ok: false, orphans: { total: 1, entries: [{ key: 'action:typo', hint: 'Key not found' }] } }
		});
		const orphaned = await run('sync-index.mjs', ['--url', url], { cwd: repoWithIndex(TWO_FEATURES) });
		expect(orphaned.status).toBe(1);
		// The block that calls for an edit is printed; the rest of the answer is not.
		expect(JSON.parse(orphaned.stdout).orphans).toEqual([{ key: 'action:typo', hint: 'Key not found' }]);
	});
});

describe('apply-batch.mjs', () => {
	const OPS = [{ kind: 'add_state_definition', path: 'car.fuel', type: 'number' }];

	it('dry-runs the operations of a file, prints the token, then commits it without resending them', async () => {
		fake.tools.apply_behavior_batch = (args) =>
			args.commit
				? { json: { available: true, batch: { ok: true, errors: [], refs: { fuel: 'a1b2c3d4' }, commitToken: null } } }
				: { json: { available: true, batch: { ok: true, errors: [], refs: {}, commitToken: 'tok-1', scenarios: { passed: 3, failed: 0 }, raw: { big: 'x' } }, warnings: ['shape'] } };
		const dir = repoWithIndex(TWO_FEATURES);
		writeFileSync(join(dir, 'ops.json'), JSON.stringify({ operations: OPS }));

		const dry = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--dry-run', '--url', url], { cwd: dir });
		expect(dry.stderr).toBe('');
		expect(dry.status).toBe(0);
		expect(argsOf(toolCalls()[0])).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', operations: OPS, dry_run: true });
		expect(JSON.parse(dry.stdout)).toEqual({
			ok: true,
			errors: [],
			refs: {},
			commitToken: 'tok-1',
			scenarios: { passed: 3, failed: 0 },
			warnings: ['shape']
		});

		const commit = await run('apply-batch.mjs', ['feat-boost', '--commit', 'tok-1', '--url', url], { cwd: dir });
		expect(commit.status).toBe(0);
		expect(argsOf(toolCalls()[1])).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', commit: 'tok-1' });
		expect(JSON.parse(commit.stdout)).toEqual({ ok: true, errors: [], refs: { fuel: 'a1b2c3d4' }, commitToken: null });
	});

	it('guards the write on the version it was written against, and says what moved when it is refused', async () => {
		fake.tools.apply_behavior_batch = (args) =>
			args.expected_updated_at === '2026-09-20T10:00:00.000Z'
				? {
						json: {
							available: true,
							batch: {
								ok: false,
								conflict: true,
								errors: ['The feature changed since it was read'],
								refs: {},
								commitToken: null,
								currentUpdatedAt: '2026-09-20T10:05:00.000Z',
								changedSince: ['scenario:9f6a6761'],
								changedSinceTotal: 1
							}
						}
					}
				: { json: { available: true, batch: { ok: true, errors: [], refs: {}, commitToken: null, updatedAt: '2026-09-20T10:05:00.000Z', relatedElsewhere: { statePaths: [{ path: 'car.fuel' }] } } } };
		const dir = repoWithIndex(TWO_FEATURES);
		writeFileSync(join(dir, 'ops.json'), JSON.stringify(OPS));

		const refused = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--expect', '2026-09-20T10:00:00.000Z', '--url', url], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(argsOf(toolCalls()[0])).toMatchObject({ expected_updated_at: '2026-09-20T10:00:00.000Z' });
		expect(JSON.parse(refused.stdout)).toMatchObject({
			ok: false,
			conflict: true,
			currentUpdatedAt: '2026-09-20T10:05:00.000Z',
			changedSince: ['scenario:9f6a6761'],
			changedSinceTotal: 1
		});

		// Without the flag the argument is not sent at all, and a write that lands
		// reports the version it produced and what it touches elsewhere.
		const applied = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--url', url], { cwd: dir });
		expect(applied.status).toBe(0);
		expect(argsOf(toolCalls()[1])).not.toHaveProperty('expected_updated_at');
		expect(JSON.parse(applied.stdout)).toMatchObject({
			ok: true,
			updatedAt: '2026-09-20T10:05:00.000Z',
			relatedElsewhere: { statePaths: [{ path: 'car.fuel' }] }
		});
		expect(JSON.parse(applied.stdout)).not.toHaveProperty('conflict');
	});

	it('takes a bare array of operations, and exits 1 on a rejected batch with its errors', async () => {
		fake.mode = 'sse';
		fake.tools.apply_behavior_batch = () => ({ json: { available: true, batch: { ok: false, errors: ['add_action needs a rule'], refs: {}, commitToken: null } } });
		const dir = tempDir();
		writeFileSync(join(dir, 'ops.json'), JSON.stringify(OPS));
		const rejected = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--project', 'vector-rally', '--url', url], { cwd: dir });
		expect(rejected.status).toBe(1);
		expect(argsOf(toolCalls()[0])).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', operations: OPS });
		expect(JSON.parse(rejected.stdout)).toMatchObject({ ok: false, errors: ['add_action needs a rule'] });
	});

	it('refuses a call that cannot mean anything before touching the network', async () => {
		const usage = await run('apply-batch.mjs', ['feat-boost', '--url', url]);
		expect(usage.status).toBe(1);
		expect(usage.stderr).toContain('Usage: apply-batch.mjs');

		const dir = tempDir();
		writeFileSync(join(dir, 'ops.json'), '[]');
		const empty = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--project', 'p', '--url', url], { cwd: dir });
		expect(empty.status).toBe(1);
		expect(empty.stderr).toContain('holds no operations');
		expect(fake.seen).toEqual([]);
	});
});
