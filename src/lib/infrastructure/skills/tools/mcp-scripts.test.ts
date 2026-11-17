import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('await-event.mjs [criterion:ac-leaf-ac-evo-live-chat-free]', () => {
	it('waits in short holds while nothing comes, then exits printing the event', async () => {
		let calls = 0;
		fake.tools.await_evolution_event = () => {
			calls += 1;
			return { json: calls < 3 ? { kind: 'nothing', sessionId: 's1', waitedSeconds: 45 } : { kind: 'progress', sessionId: 's1', progress: { happened: ['Need validated'] } } };
		};
		const out = await run('await-event.mjs', ['p1', 'r1', 's1'], { env: { LYRIKS_MCP_URL: url } });
		expect(out.status).toBe(0);
		expect(JSON.parse(out.stdout)).toMatchObject({ kind: 'progress', progress: { happened: ['Need validated'] } });
		const seen = toolCalls();
		expect(seen).toHaveLength(3);
		expect(argsOf(seen[0])).toEqual({ project_id: 'p1', request_id: 'r1', session_id: 's1', max_wait_seconds: 45 });
	});

	it('exits on a cancellation that travels with nothing, and on the end of the session', async () => {
		fake.tools.await_evolution_event = () => ({ json: { kind: 'nothing', sessionId: 's1', cancelled: { clickId: 'c1', undone: 2 } } });
		const cancelled = await run('await-event.mjs', ['p1', 'r1', 's1', '--hold', '30'], { env: { LYRIKS_MCP_URL: url } });
		expect(JSON.parse(cancelled.stdout).cancelled).toMatchObject({ clickId: 'c1' });
		expect(argsOf(toolCalls()[0]).max_wait_seconds).toBe(30);
		fake.tools.await_evolution_event = () => ({ json: { kind: 'ended', sessionId: 's1', reason: 'ended_by_person' } });
		const ended = await run('await-event.mjs', ['p1', 'r1', 's1'], { env: { LYRIKS_MCP_URL: url } });
		expect(JSON.parse(ended.stdout)).toMatchObject({ kind: 'ended', reason: 'ended_by_person' });
	});

	it('refuses a call that cannot mean anything before touching the network', async () => {
		const missing = await run('await-event.mjs', ['p1', 'r1'], { env: { LYRIKS_MCP_URL: url } });
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain('Usage: await-event.mjs');
		const tooLong = await run('await-event.mjs', ['p1', 'r1', 's1', '--hold', '900'], { env: { LYRIKS_MCP_URL: url } });
		expect(tooLong.status).toBe(1);
		expect(tooLong.stderr).toContain('--hold');
		expect(toolCalls()).toHaveLength(0);
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

	// Field run 2026-10-27: a 128-op commit answered ok, the gateway capped it, and the helper printed ok:false.
	it('reads the verdict of an answer the gateway capped', async () => {
		fake.tools.apply_behavior_batch = () => ({
			json: { _capped: true, kind: 'object', bytes: 26392, partial: { available: true, batch: { ok: true, errors: [], refs: { fuel: 'a1b2c3d4' }, commitToken: 'tok-9' } } }
		});
		const dir = repoWithIndex(TWO_FEATURES);
		writeFileSync(join(dir, 'ops.json'), JSON.stringify(OPS));
		const out = await run('apply-batch.mjs', ['feat-boost', 'ops.json', '--dry-run', '--url', url], { cwd: dir });
		expect(out.status).toBe(0);
		expect(JSON.parse(out.stdout)).toMatchObject({ ok: true, refs: { fuel: 'a1b2c3d4' }, commitToken: 'tok-9', capped: true });
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

/** The block sync_skills merges into CLAUDE.md, naming the project the repository is bound to. */
const bindingBlock = (projectId: string) =>
	`# Team notes\n\n<!-- lyriks-binding -->\n## This product is specified in Lyriks\n\nIts spec lives in the Lyriks project \`${projectId}\` and nowhere else.\n<!-- /lyriks-binding -->\n`;

// A field repository kept a .unspa.json naming a project since replaced, while
// CLAUDE.md named the right one: every sync went to the old project in silence.
describe('the project a networked script writes to', () => {
	it('refuses to sync when the index and the binding block name two projects, and prints the command to run', async () => {
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES, 'big-island-04ba81');
		writeFileSync(join(dir, 'CLAUDE.md'), bindingBlock('big-island-c4e7da'));
		const refused = await run('sync-index.mjs', ['--url', url, '--token', 's3cret'], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(toolCalls()).toEqual([]);
		expect(refused.stderr).not.toContain('s3cret');
		expect(refused.stderr).toContain('Nothing was sent');
		expect(refused.stderr).toContain('names projectId big-island-04ba81 but the binding block of CLAUDE.md names big-island-c4e7da');
		expect(refused.stderr).toContain('--url');
		expect(refused.stderr).toMatch(/node \S*sync-index\.mjs --url \S+ --token "\$LYRIKS_MCP_TOKEN" --project big-island-c4e7da/);
		expect(refused.stderr).toContain('index-file.mjs set-project <id>');

		// Naming the project settles it, and the disagreement is still said out loud.
		const sent = await run('sync-index.mjs', ['--project', 'big-island-c4e7da', '--url', url], { cwd: dir });
		expect(sent.status).toBe(0);
		expect(argsOf(toolCalls()[0]).project_id).toBe('big-island-c4e7da');
		expect(sent.stderr).toContain('WARNING (Lyriks project): --project big-island-c4e7da differs from the projectId big-island-04ba81');
		const printed = JSON.parse(sent.stdout);
		expect(printed).toMatchObject({ project: 'big-island-c4e7da', projectSource: '--project' });
		expect(printed.projectWarnings).toHaveLength(1);
	});

	it('takes the binding block when the index names no project, and stays quiet when all agree', async () => {
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES, null);
		writeFileSync(join(dir, 'CLAUDE.md'), bindingBlock('big-island-c4e7da'));
		const result = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		expect(argsOf(toolCalls()[0]).project_id).toBe('big-island-c4e7da');
		expect(JSON.parse(result.stdout)).toMatchObject({ project: 'big-island-c4e7da', projectSource: 'CLAUDE.md' });
	});

	it('refuses the same way in apply-batch, which writes too', async () => {
		fake.tools.apply_behavior_batch = () => ({ json: { batch: { ok: true } } });
		const dir = repoWithIndex(TWO_FEATURES, 'big-island-04ba81');
		writeFileSync(join(dir, 'AGENTS.md'), bindingBlock('big-island-c4e7da'));
		writeFileSync(join(dir, 'ops.json'), JSON.stringify([{ op: 'noop' }]));
		const refused = await run('apply-batch.mjs', ['feat-a', 'ops.json', '--dry-run', '--url', url], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain('binding block of AGENTS.md names big-island-c4e7da');
		expect(toolCalls()).toEqual([]);
	});
});

describe('index-file.mjs upsert --sync', () => {
	it('sends criterion keys exactly as upserted, alone', async () => {
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES);
		const criterion = { verification: { kind: 'unit', files: ['tests/boost.spec.ts'] } };
		writeFileSync(join(dir, 'entries.json'), JSON.stringify({ 'criterion:c-1': criterion }));
		const result = await run('index-file.mjs', ['upsert', 'entries.json', '--sync', '--json', '--url', url], { cwd: dir });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(argsOf(toolCalls()[0])).toEqual({ project_id: 'vector-rally', index: { 'criterion:c-1': criterion } });
		const printed = JSON.parse(result.stdout);
		expect(printed).toMatchObject({ added: ['criterion:c-1'], written: true, sync: { sent: 1, project: 'vector-rally' } });
	});

	it('refuses loose action or child keys without --feature, before writing anything', async () => {
		const dir = repoWithIndex(TWO_FEATURES);
		const before = readFileSync(join(dir, '.unspa.json'), 'utf8');
		writeFileSync(join(dir, 'entries.json'), JSON.stringify({ 'rule:boost-cooldown': entry(16) }));
		const refused = await run('index-file.mjs', ['upsert', 'entries.json', '--sync', '--url', url], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain('Nothing was written or sent: rule:boost-cooldown belong to an action or a surface');
		expect(refused.stderr).toContain('--feature <featureId>');
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before);
		expect(toolCalls()).toEqual([]);
	});

	it('with --feature, writes the entries and sends the whole feature slice they belong to', async () => {
		fake.tools.get_behavior_feature = () => ({
			json: { featureId: 'feat-boost', total: 4, keys: ['action:boost', 'rule:boost-needs-fuel', 'event:boost_applied', 'rule:boost-cooldown'] }
		});
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const dir = repoWithIndex(TWO_FEATURES);
		writeFileSync(join(dir, 'entries.json'), JSON.stringify({ 'rule:boost-cooldown': entry(16), 'rule:refuel-in-pit': entry(44) }));
		const result = await run('index-file.mjs', ['upsert', 'entries.json', '--sync', '--feature', 'feat-boost', '--url', url], { cwd: dir });
		expect(result.status).toBe(0);
		expect(Object.keys(argsOf(toolCalls().at(-1)!).index as object)).toEqual([
			'action:boost',
			'rule:boost-needs-fuel',
			'event:boost_applied',
			'rule:boost-cooldown'
		]);
		expect(result.stdout).toContain('added     rule:boost-cooldown');
		expect(result.stdout).toContain('replaced  rule:refuel-in-pit');
		expect(result.stdout).toContain('Not in feature feat-boost, so not sent: rule:refuel-in-pit.');
	});

	it('refuses a sync to a disputed project, and names it in --json when only writing locally', async () => {
		const dir = repoWithIndex(TWO_FEATURES, 'big-island-04ba81');
		writeFileSync(join(dir, 'CLAUDE.md'), bindingBlock('big-island-c4e7da'));
		writeFileSync(join(dir, 'entries.json'), JSON.stringify({ 'criterion:c-1': { verification: { kind: 'manual' } } }));
		const refused = await run('index-file.mjs', ['upsert', 'entries.json', '--sync', '--url', url], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain('Nothing was written or sent: two different projects are named');
		expect(toolCalls()).toEqual([]);

		const local = await run('index-file.mjs', ['upsert', 'entries.json', '--json'], { cwd: dir });
		expect(local.status).toBe(0);
		expect(local.stderr).toContain('WARNING (Lyriks project)');
		expect(JSON.parse(local.stdout).projectWarnings[0]).toContain('big-island-c4e7da');
	});
});

// Field run 2026-10-27: a 514-entry sync answered past the gateway cap and the helper printed { _capped, bytes } as its counters.
describe('a capped answer, read by every script', () => {
	it('gives sync-index the counters inside the cap, not the cap itself', async () => {
		fake.tools.sync_implementation_index = () => ({ json: { _capped: true, kind: 'object', bytes: 26850, partial: { ok: true, synced: 40, skipped: 0, orphans: { total: 0, entries: [] } } } });
		const dir = repoWithIndex(TWO_FEATURES);
		const out = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(out.status).toBe(0);
		expect(JSON.parse(out.stdout).counters).toMatchObject({ ok: true, synced: 40, skipped: 0, capped: true });
	});
});

// Field run 2026-10-27: a 12,690-character file retyped into attach_source came
// back 12,662 characters long (four literal ¡ and four ￿ decoded), and
// every span offset after them pointed at the wrong text.
describe('attach-source.mjs', () => {
	const CODE = 'const urlRegex = /[\\u00a1-\\uffff]+/;\nconst wide = "naïve";\n';

	it('sends each file exactly as it is on disk and prints the source id', async () => {
		let n = 0;
		fake.tools.attach_source = () => ({ json: { available: true, ok: true, sourceId: `src-${++n}`, byteLength: 1, elementCount: 2 } });
		const dir = repoWithIndex(TWO_FEATURES);
		const { mkdirSync } = await import('node:fs');
		mkdirSync(join(dir, 'server'), { recursive: true });
		writeFileSync(join(dir, 'server/utils.js'), CODE);
		writeFileSync(join(dir, 'server/env.js'), 'module.exports = {};\n');
		const out = await run('attach-source.mjs', ['feat-boost', './server/utils.js', 'server/env.js', '--url', url], { cwd: dir });
		expect(out.stderr).toBe('');
		expect(out.status).toBe(0);
		const sent = toolCalls().slice(-2).map(argsOf);
		expect(sent[0]).toEqual({ project_id: 'vector-rally', feature_id: 'feat-boost', file_name: 'server/utils.js', content: CODE, kind: 'code' });
		expect(sent[1].file_name).toBe('server/env.js');
		expect(out.stdout).toContain(`server/utils.js: src-1 (${CODE.length} characters)`);
	});

	it('reads a frozen commit with --commit, and sends nothing when a path does not exist', async () => {
		fake.tools.attach_source = () => ({ json: { available: true, ok: true, sourceId: 'src-c', byteLength: 1, elementCount: 1 } });
		const dir = repoWithIndex(TWO_FEATURES);
		const git = (...args: string[]) => new Promise<void>((resolve) => spawn('git', args, { cwd: dir }).on('close', () => resolve()));
		await git('init', '-q');
		writeFileSync(join(dir, 'app.js'), CODE);
		await git('add', 'app.js');
		await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'frozen');
		writeFileSync(join(dir, 'app.js'), 'changed after the freeze\n');
		const before = toolCalls().length;
		const out = await run('attach-source.mjs', ['feat-boost', 'app.js', '--commit', 'HEAD', '--url', url], { cwd: dir });
		expect(out.status).toBe(0);
		expect(argsOf(toolCalls().at(-1)!).content).toBe(CODE);
		const missing = await run('attach-source.mjs', ['feat-boost', 'app.js', 'nope.js', '--url', url], { cwd: dir });
		expect(missing.status).not.toBe(0);
		expect(toolCalls().length).toBe(before + 1);
	});
});

// The person's AI reports what git says; Lyriks never reads the repository
// (feat-evo-code-branch). These run in a throwaway git repository.
describe('the code of a request, reported from git [criterion:ac-leaf-ac-evo-branch-no-repo]', () => {
	const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.test', ...args], { cwd, encoding: 'utf8' }).trim();

	/** main with one commit, then the request's branch with a commit of code and its proofs. */
	function branchRepo(index: Record<string, Record<string, unknown>>) {
		const dir = repoWithIndex({});
		mkdirSync(join(dir, 'src'));
		writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
		git(dir, ['init', '-q', '-b', 'main']);
		git(dir, ['add', '-A']);
		git(dir, ['commit', '-qm', 'base']);
		const base = git(dir, ['rev-parse', 'HEAD']);
		git(dir, ['switch', '-qc', 'evo/EVO-1-boost']);
		writeFileSync(join(dir, 'src/a.ts'), 'export const a = 2;\n');
		git(dir, ['commit', '-qam', 'code']);
		const code = git(dir, ['rev-parse', 'HEAD']);
		const filled = JSON.parse(JSON.stringify(index).replaceAll('CODE', code)) as Record<string, unknown>;
		writeFileSync(join(dir, '.unspa.json'), JSON.stringify({ format: 'unspaghettit-index', version: 1, projectId: 'vector-rally', index: filled }, null, 2));
		git(dir, ['add', '-A']);
		git(dir, ['commit', '-q', '--allow-empty', '-m', 'proofs']);
		return { dir, base, code };
	}

	const PROVEN = {
		'action:boost': entry(10, { verifiedAt: '2026-10-29T00:00:00.000Z', verifiedRevision: 'CODE' }),
		'action:refuel': entry(40, { verifiedAt: '2026-10-29T00:00:00.000Z', verifiedRevision: '0000000aaaaaaa' }),
		'criterion:c-1': { verification: { kind: 'unit', lastResult: { passed: true, at: 'x', revision: 'CODE' } } },
		'criterion:c-2': { verification: { kind: 'unit', lastResult: { passed: true, at: 'x', revision: 'CODE', dirty: true } } },
		'criterion:c-3': { verification: { kind: 'unit', lastResult: { passed: false, at: 'x', revision: 'old' } } }
	};
	const board = (code: Record<string, unknown>) => () => ({ json: { requests: [{ id: 'req-1', code: { deploymentBranch: 'main', ...code } }] } });

	it('after the sync, reports the branch, where it started, its last commit of code and the proofs taken elsewhere [criterion:ac-leaf-ac-evo-branch-state]', async () => {
		const { dir, base, code } = branchRepo(PROVEN);
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		fake.tools.get_evolution = board({ expectedBranch: 'evo/EVO-1-boost' });
		fake.tools.apply_evolution_batch = () => ({ json: { ok: true, applied: true, results: [{ index: 0, op: 'report_code_state', ok: true, summary: 'Code of EVO-1 at ' + code.slice(0, 7) }] } });
		const result = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		const reported = argsOf(toolCalls().find((c) => c.message.params?.name === 'apply_evolution_batch')!);
		expect(reported.project_id).toBe('vector-rally');
		expect(reported.operations).toEqual([
			{
				op: 'report_code_state',
				// No remote: the checkout's folder names the repository [criterion:ac-leaf-ac-evo-branch-repository].
				repository: { name: dir.split('/').at(-1), url: null },
				// Every commit since the start, the index-only one marked [criterion:ac-leaf-ac-evo-branch-history].
				history: { count: 2, commits: [expect.objectContaining({ subject: 'proofs', code: false }), expect.objectContaining({ sha: code, subject: 'code', code: true })] },
				branch: 'evo/EVO-1-boost',
				baseCommit: base,
				head: expect.any(String),
				codeHead: code,
				clean: true,
				proofsChecked: 4,
				proofsOnOtherCommits: 2
			}
		]);
		// The summary printed counts the commits; only Lyriks receives them.
		expect(JSON.parse(result.stdout).codeState).toMatchObject({ reported: true, commitCount: 2, answer: `accepted: Code of EVO-1 at ${code.slice(0, 7)}` });
		expect(JSON.parse(result.stdout).codeState.history).toBeUndefined();
	});

	it('says uncommitted code, and keeps the sync standing when the platform refuses the report [criterion:ac-leaf-ac-evo-branch-derived]', async () => {
		const { dir } = branchRepo(PROVEN);
		writeFileSync(join(dir, 'src/a.ts'), 'export const a = 3;\n');
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		fake.tools.get_evolution = board({});
		fake.tools.apply_evolution_batch = () => ({ json: { ok: false, applied: false, results: [{ index: 0, op: 'report_code_state', ok: false, reason: 'This request\'s code is on evo/EVO-2-other.' }] } });
		const result = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(result.status).toBe(0);
		expect(result.stderr).toContain("warning: code state refused: This request's code is on evo/EVO-2-other.");
		const op = (argsOf(toolCalls().find((c) => c.message.params?.name === 'apply_evolution_batch')!).operations as Record<string, unknown>[])[0];
		expect(op.clean).toBe(false);
		expect(JSON.parse(result.stdout).codeState).toMatchObject({ reported: false, answer: "refused: This request's code is on evo/EVO-2-other." });
	});

	it('says as a note, never a warning, that no open request takes the code state [criterion:dd0fd105]', async () => {
		const { dir } = branchRepo(PROVEN);
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		fake.tools.apply_evolution_batch = () => ({ json: { ok: true, results: [{ index: 0, op: 'report_code_state', ok: true, summary: 'never asked' }] } });
		const quiet = 'no open Evolution request: code state not attached';

		// No open request on the whole board: the report is not even sent.
		fake.tools.get_evolution = () => ({ json: { requests: [{ id: 'req-0', status: 'closed', code: null }] } });
		const none = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(none.status).toBe(0);
		expect(none.stderr).toBe('');
		expect(toolCalls().map((c) => c.message.params?.name)).toEqual(['sync_implementation_index', 'get_evolution']);
		expect(JSON.parse(none.stdout).codeState).toMatchObject({ reported: false, noRequest: true, branch: 'evo/EVO-1-boost', answer: quiet });

		// Open requests on other branches: the platform resolves none for this one and names none in its refusal.
		fake.seen = [];
		fake.tools.get_evolution = board({ expectedBranch: 'evo/EVO-2-other' });
		fake.tools.apply_evolution_batch = () => ({
			json: { ok: false, applied: false, results: [{ index: 0, op: 'report_code_state', requestId: null, ok: false, summary: 'requestId is required.' }] }
		});
		const elsewhere = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(elsewhere.status).toBe(0);
		expect(elsewhere.stderr).toBe('');
		expect(elsewhere.stderr).not.toContain('requestId is required');
		expect(JSON.parse(elsewhere.stdout).codeState).toMatchObject({ reported: false, noRequest: true, answer: `${quiet} (none is built on evo/EVO-1-boost)` });
	});

	it('still warns of a refusal for the request the branch belongs to, and of an operation the gateway does not know [criterion:dd0fd105]', async () => {
		const { dir } = branchRepo(PROVEN);
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		fake.tools.get_evolution = board({ branch: 'evo/EVO-1-boost' });
		fake.tools.apply_evolution_batch = () => ({
			json: { ok: false, applied: false, results: [{ index: 0, op: 'report_code_state', requestId: 'req-1', ok: false, summary: 'Code is reported from the Build until the merge.' }] }
		});
		const refused = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(refused.status).toBe(0);
		expect(refused.stderr).toContain('warning: code state refused: Code is reported from the Build until the merge.');
		expect(JSON.parse(refused.stdout).codeState).toMatchObject({ reported: false, answer: 'refused: Code is reported from the Build until the merge.' });
		expect(JSON.parse(refused.stdout).codeState.noRequest).toBeUndefined();

		fake.tools.apply_evolution_batch = () => ({
			json: { ok: false, results: [{ index: 0, op: 'report_code_state', requestId: null, ok: false, summary: 'Unknown operation "report_code_state".' }] }
		});
		const older = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(older.stderr).toContain('warning: code state refused: Unknown operation "report_code_state".');
	});

	it('reports nothing from the deployment branch, nor with --no-git', async () => {
		const { dir } = branchRepo(PROVEN);
		git(dir, ['switch', '-q', 'main']);
		git(dir, ['merge', '-q', '--no-ff', '-m', 'merge EVO-1', 'evo/EVO-1-boost']);
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		fake.tools.get_evolution = board({});
		const onMain = await run('sync-index.mjs', ['--url', url], { cwd: dir });
		expect(onMain.status).toBe(0);
		expect(toolCalls().map((c) => c.message.params?.name)).toEqual(['sync_implementation_index', 'get_evolution']);
		expect(JSON.parse(onMain.stdout).codeState.answer).toContain('main is the deployment branch');

		fake.seen = [];
		const skipped = await run('sync-index.mjs', ['--no-git', '--url', url], { cwd: dir });
		expect(skipped.status).toBe(0);
		expect(toolCalls().map((c) => c.message.params?.name)).toEqual(['sync_implementation_index']);
		expect(JSON.parse(skipped.stdout).codeState).toBeUndefined();
	});

	it('report-merge.mjs sends the merge with git\'s answer that the validated commit is in it [criterion:ac-leaf-ac-evo-branch-merge]', async () => {
		const { dir, code } = branchRepo({});
		git(dir, ['switch', '-q', 'main']);
		git(dir, ['merge', '-q', '--no-ff', '-m', 'merge EVO-1', 'evo/EVO-1-boost']);
		const merge = git(dir, ['rev-parse', 'HEAD']);
		fake.tools.get_evolution = board({ branch: 'evo/EVO-1-boost', validatedCommit: code });
		fake.tools.apply_evolution_batch = () => ({ json: { ok: true, results: [{ ok: true, summary: 'Merged into main: the change is live' }] } });
		const result = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--url', url], { cwd: dir });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		const sent = argsOf(toolCalls().find((c) => c.message.params?.name === 'apply_evolution_batch')!);
		expect(sent.operations).toEqual([{ op: 'report_merge', requestId: 'req-1', branch: 'evo/EVO-1-boost', into: 'main', mergeCommit: merge, containsValidated: true }]);
		expect(JSON.parse(result.stdout)).toMatchObject({ recorded: true, validatedCommit: code, answer: 'Merged into main: the change is live' });
	});

	it('report-merge.mjs syncs the index once the merge is recorded, and never when it is not [criterion:ac-leaf-ac-evo-branch-merge-syncs]', async () => {
		const { dir, code } = branchRepo({ 'action:boost': entry(10), 'criterion:c-1': { verification: { kind: 'unit', lastResult: { passed: true, at: 'x', revision: 'CODE' } } } });
		git(dir, ['switch', '-q', 'main']);
		git(dir, ['merge', '-q', '--no-ff', '-m', 'merge EVO-1', 'evo/EVO-1-boost']);
		fake.tools.get_evolution = board({ branch: 'evo/EVO-1-boost', validatedCommit: code });
		fake.tools.apply_evolution_batch = () => ({ json: { ok: true, results: [{ ok: true, summary: 'Merged into main: the change is live' }] } });
		fake.tools.sync_implementation_index = () => ({ json: SYNC_ANSWER });
		const result = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--url', url], { cwd: dir });
		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		const names = toolCalls().map((c) => c.message.params?.name);
		expect(names.indexOf('sync_implementation_index')).toBeGreaterThan(names.indexOf('apply_evolution_batch'));
		const synced = argsOf(toolCalls().find((c) => c.message.params?.name === 'sync_implementation_index')!);
		expect(Object.keys(synced.index as Record<string, unknown>)).toEqual(['action:boost', 'criterion:c-1']);
		expect(JSON.parse(result.stdout).indexSync).toMatchObject({ ran: true, ok: true, project: 'vector-rally' });

		fake.seen = [];
		const skipped = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--no-sync', '--url', url], { cwd: dir });
		expect(skipped.status).toBe(0);
		expect(toolCalls().map((c) => c.message.params?.name)).not.toContain('sync_implementation_index');

		fake.seen = [];
		fake.tools.apply_evolution_batch = () => ({ json: { ok: false, results: [{ ok: false, reason: 'git says the validated commit is not in this merge.' }] } });
		const refused = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--url', url], { cwd: dir });
		expect(refused.status).toBe(1);
		expect(toolCalls().map((c) => c.message.params?.name)).not.toContain('sync_implementation_index');
	});

	it('report-merge.mjs says when the validated commit is not in the merge, and exits 1 when the merge is not recorded', async () => {
		const { dir, code } = branchRepo({});
		git(dir, ['switch', '-q', 'main']);
		fake.tools.get_evolution = board({ branch: 'evo/EVO-1-boost', validatedCommit: code });
		fake.tools.apply_evolution_batch = () => ({ json: { ok: false, results: [{ ok: false, reason: 'git says the validated commit is not in this merge.' }] } });
		const result = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--url', url], { cwd: dir });
		expect(result.status).toBe(1);
		const sent = argsOf(toolCalls().find((c) => c.message.params?.name === 'apply_evolution_batch')!);
		expect((sent.operations as Record<string, unknown>[])[0].containsValidated).toBe(false);

		fake.seen = [];
		fake.tools.get_evolution = board({ branch: 'evo/EVO-1-boost', validatedCommit: null });
		const unvalidated = await run('report-merge.mjs', ['--branch', 'evo/EVO-1-boost', '--url', url], { cwd: dir });
		expect(unvalidated.status).toBe(1);
		expect(unvalidated.stderr).toContain('has no validated commit: validate its verification first');
		expect(toolCalls().map((c) => c.message.params?.name)).toEqual(['get_evolution']);
	});
});

// Owner request 2026-11-05: updating the playbooks through an agent ran past its
// quota. Through tool answers alone a fresh install read about 464,000
// characters and retyped 288,000 more; this script copies the same files from
// the server without passing them through the conversation.
describe('sync-skills.mjs [criterion:3f42911b]', () => {
	const GUIDES: Record<string, string> = {
		'lyriks-build': '---\nname: lyriks-build\ndescription: Build.\ncontentHash: g-build\n---\n# Build\nliteral ¡ and "quotes" kept\n',
		'lyriks-big': '---\nname: lyriks-big\ndescription: Big.\ncontentHash: g-big\n---\n# Too big to ride with the others\n'
	};
	const SCRIPTS: Record<string, string> = {
		'.lyriks/tools/mcp-client.mjs': '// contentHash: t-client\nexport const client = 1;\n',
		'.lyriks/tools/sync-skills.mjs': '#!/usr/bin/env node\n// contentHash: t-sync\nconsole.log(1);\n',
		'.lyriks/tools/check-index.mjs': '#!/usr/bin/env node\n// contentHash: t-check\nconsole.log(2);\n'
	};
	const HOOK = { path: '.claude/hooks/lyriks-bound-prompt.mjs', content: '#!/usr/bin/env node\n// contentHash: h-prompt\n', contentHash: 'h-prompt' };
	const TOOLS_HOOK = { path: '.claude/hooks/lyriks-allow-tools.mjs', content: '#!/usr/bin/env node\n// contentHash: h-tools\n', contentHash: 'h-tools' };
	const promptEntry = { type: 'command', command: `node ${HOOK.path}`, timeout: 10, statusMessage: 'Lyriks binding' };
	const toolsEntry = { type: 'command', command: `node ${TOOLS_HOOK.path}`, timeout: 10, statusMessage: 'Lyriks tools' };
	const hash = (text: string) => /contentHash: (\S+)/.exec(text)![1];
	const layout = (client: string, id: string) =>
		client === 'claude'
			? { client, path: `.claude/skills/${id}/SKILL.md` }
			: { client, path: `.agents/skills/${id}/SKILL.md`, pointerPath: 'AGENTS.md', pointerBlock: `<!-- lyriks-skill:${id} -->\nread .agents/skills/${id}/SKILL.md\n<!-- /lyriks-skill:${id} -->` };
	const block = (project: string | undefined) =>
		`<!-- lyriks-binding -->\n## This product is specified in Lyriks\nIts spec lives in ${project ? `the Lyriks project \`${project}\`` : 'its Lyriks project'}.\n<!-- /lyriks-binding -->`;

	/** A server like the gateway: what the client holds comes back without content, one guide never fits, one script waits a round. */
	function serveCatalog() {
		fake.tools.sync_skills = (args) => {
			const client = String(args.client ?? 'claude');
			const guides = new Map(((args.installed as { id: string; content_hash?: string }[]) ?? []).map((ref) => [ref.id, ref.content_hash]));
			const tools = new Map(((args.installed_tools as { path: string; content_hash?: string }[]) ?? []).map((ref) => [ref.path, ref.content_hash]));
			const deferredForSize: string[] = [];
			const skills = Object.entries(GUIDES).map(([id, content]) => {
				if (guides.get(id) === hash(content)) return { id, name: id, contentHash: hash(content), status: 'up-to-date' };
				const entry = { id, name: id, contentHash: hash(content), status: guides.has(id) ? 'update' : 'new', installTargets: [layout(client, id)] };
				if (id === 'lyriks-big') {
					deferredForSize.push(id);
					return { ...entry, contentDeferred: true };
				}
				return { ...entry, installContent: content };
			});
			const firstRound = tools.size === 0;
			const deferredScripts: string[] = [];
			const scripts = Object.entries(SCRIPTS).map(([path, content]) => {
				if (tools.get(path) === hash(content)) return { path, contentHash: hash(content), unchanged: true };
				if (firstRound && path.endsWith('check-index.mjs')) {
					deferredScripts.push(path);
					return { path, contentHash: hash(content), deferred: true };
				}
				return { path, content, contentHash: hash(content), purpose: 'a script' };
			});
			const hookOf = (hook: typeof HOOK, extra: Record<string, unknown>) =>
				tools.get(hook.path) === hook.contentHash ? { path: hook.path, contentHash: hook.contentHash, unchanged: true, ...extra } : { ...hook, ...extra };
			const target: Record<string, unknown> = { client, pointerPath: client === 'claude' ? 'CLAUDE.md' : 'AGENTS.md', pointerBlock: block(args.project_id as string | undefined) };
			if (client === 'claude') {
				// The first answer has no room for the prompt hook: it waits a round, unwired.
				const hookWaits = firstRound ? (deferredScripts.push(HOOK.path), true) : false;
				target.hook = hookWaits ? { path: HOOK.path, contentHash: HOOK.contentHash, deferred: true } : hookOf(HOOK, { settingsPath: '.claude/settings.json', settingsEvent: 'UserPromptSubmit', settingsEntry: promptEntry, settingsContent: JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [promptEntry] }] } }, null, 2) + '\n' });
				target.toolsHook = hookOf(TOOLS_HOOK, { settingsPath: '.claude/settings.json', settingsEvent: 'PreToolUse', settingsMatcher: '^mcp__.*', settingsEntry: toolsEntry, settingsContent: JSON.stringify({ hooks: { PreToolUse: [{ matcher: '^mcp__.*', hooks: [toolsEntry] }] } }, null, 2) + '\n' });
			}
			return {
				json: {
					skills,
					unknown: [],
					binding: { projectId: args.project_id ?? null, markers: { open: '<!-- lyriks-binding -->', close: '<!-- /lyriks-binding -->' }, targets: [target], tools: scripts },
					...(deferredForSize.length ? { deferredForSize } : {}),
					...(deferredScripts.length ? { deferredScripts } : {})
				}
			};
		};
		fake.tools.get_skill = (args) => {
			const id = String(args.skill_id);
			return { json: { id, name: id, contentHash: hash(GUIDES[id]), installContent: GUIDES[id], installTargets: [layout(String(args.client ?? 'claude'), id)] } };
		};
	}

	const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8');

	it('writes every guide, script and hook verbatim, merges the block, wires the hooks, and prints no content', async () => {
		serveCatalog();
		fake.requireToken = 'lyriks_mcp_skills';
		const dir = tempDir();
		writeFileSync(join(dir, 'CLAUDE.md'), '# My notes\n\nKeep this.\n\n' + block('vector-rally') + '\n\nAnd this.\n');
		mkdirSync(join(dir, '.claude'), { recursive: true });
		writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node other.mjs' }] }] } }, null, 2));

		const out = await run('sync-skills.mjs', ['--url', url, '--token', 'lyriks_mcp_skills'], { cwd: dir });
		expect(out.stderr).toBe('');
		expect(out.status).toBe(0);
		for (const [id, content] of Object.entries(GUIDES)) expect(read(dir, `.claude/skills/${id}/SKILL.md`)).toBe(content);
		for (const [path, content] of Object.entries(SCRIPTS)) expect(read(dir, path)).toBe(content);
		expect(read(dir, HOOK.path)).toBe(HOOK.content);
		expect(read(dir, TOOLS_HOOK.path)).toBe(TOOLS_HOOK.content);
		// The block between the markers is replaced; the person's text around it is not.
		expect(read(dir, 'CLAUDE.md')).toBe('# My notes\n\nKeep this.\n\n' + block('vector-rally') + '\n\nAnd this.\n');
		const settings = JSON.parse(read(dir, '.claude/settings.json'));
		expect(settings.permissions).toEqual({ allow: ['Bash(ls:*)'] });
		expect(settings.hooks.UserPromptSubmit[0].hooks).toEqual([{ type: 'command', command: 'node other.mjs' }, promptEntry]);
		expect(settings.hooks.PreToolUse).toEqual([{ matcher: '^mcp__.*', hooks: [toolsEntry] }]);
		// The project the binding block names travels with every sync, so the block keeps naming it.
		const syncs = toolCalls().filter((call) => call.message.params?.name === 'sync_skills');
		expect(syncs.every((call) => argsOf(call).project_id === 'vector-rally' && argsOf(call).client === 'claude')).toBe(true);
		// The script waiting a round came with the second answer; the guide that never fits came alone.
		expect(syncs.length).toBe(2);
		expect(toolCalls().filter((call) => call.message.params?.name === 'get_skill').map(argsOf)).toEqual([{ skill_id: 'lyriks-big', client: 'claude' }]);
		// What it prints is what it did, never what it wrote.
		expect(out.stdout).toContain('wrote .claude/skills/lyriks-build/SKILL.md');
		expect(out.stdout).toContain('wired .claude/settings.json: PreToolUse -> .claude/hooks/lyriks-allow-tools.mjs');
		expect(out.stdout).not.toContain('# Build');
		expect(out.stdout).not.toContain('console.log');

		// A second run reports everything held and writes nothing.
		fake.seen = [];
		const again = await run('sync-skills.mjs', ['--url', url, '--token', 'lyriks_mcp_skills'], { cwd: dir });
		expect(again.status).toBe(0);
		expect(again.stdout).toContain('Everything is current');
		const second = argsOf(toolCalls()[0]);
		expect(second.installed).toEqual([
			{ id: 'lyriks-big', content_hash: 'g-big' },
			{ id: 'lyriks-build', content_hash: 'g-build' }
		]);
		expect((second.installed_tools as { path: string }[]).map((ref) => ref.path).sort()).toEqual([HOOK.path, TOOLS_HOOK.path, ...Object.keys(SCRIPTS)].sort());
		expect(toolCalls().length).toBe(1);
	});

	it('leaves a settings file that is not JSON untouched, says so, and still installs the rest', async () => {
		serveCatalog();
		const dir = tempDir();
		mkdirSync(join(dir, '.claude'), { recursive: true });
		const broken = '{ "permissions": { "allow": ["mcp__lyriks__x",] } }';
		writeFileSync(join(dir, '.claude/settings.json'), broken);
		const out = await run('sync-skills.mjs', ['--url', url], { cwd: dir });
		expect(out.status).toBe(1);
		expect(read(dir, '.claude/settings.json')).toBe(broken);
		expect(out.stdout).toContain('.claude/settings.json is not valid JSON');
		expect(read(dir, '.claude/skills/lyriks-build/SKILL.md')).toBe(GUIDES['lyriks-build']);
		// No binding block yet: a fresh CLAUDE.md holds the block alone.
		expect(read(dir, 'CLAUDE.md')).toBe(block(undefined) + '\n');
	});

	it('installs the portable layout for another runtime and merges its pointer blocks', async () => {
		serveCatalog();
		const dir = tempDir();
		writeFileSync(join(dir, 'AGENTS.md'), '# Team rules\n');
		const out = await run('sync-skills.mjs', ['--client', 'codex', '--project', 'vector-rally', '--url', url], { cwd: dir });
		expect(out.stderr).toBe('');
		expect(out.status).toBe(0);
		expect(read(dir, '.agents/skills/lyriks-build/SKILL.md')).toBe(GUIDES['lyriks-build']);
		const agents = read(dir, 'AGENTS.md');
		expect(agents.startsWith('# Team rules\n\n')).toBe(true);
		expect(agents).toContain('<!-- lyriks-skill:lyriks-build -->');
		expect(agents).toContain(block('vector-rally'));
		expect(existsSync(join(dir, '.claude'))).toBe(false);
	});

	it('refuses a path that leaves the repository and writes nothing there', async () => {
		fake.tools.sync_skills = () => ({
			json: { skills: [{ id: 'evil', name: 'evil', contentHash: 'x', status: 'new', installTargets: [{ client: 'claude', path: '../outside/SKILL.md' }], installContent: 'pwned' }], unknown: [] }
		});
		const dir = tempDir();
		const out = await run('sync-skills.mjs', ['--url', url], { cwd: dir });
		expect(out.status).toBe(1);
		expect(out.stderr).toContain('climbs out of the repository');
		expect(existsSync(join(dir, '..', 'outside'))).toBe(false);
	});
});
