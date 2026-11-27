#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/wake-ai.mjs <project_id> [--detach] [--once] [--ai claude|codex|gemini|copilot] [--url URL] [--token TOKEN] [--mcp-server NAME] [--allow-api-key]
//   node .lyriks/tools/wake-ai.mjs --status | --stop
// The person's waker (feat-ai-session, "Keep my waker listening", "Wake my AI").
// Run from the repository bound to the project, it waits for the person's
// clicks on the project, and when one waits and none of their AIs is in
// session it starts their AI without a window in this repository, with the CLI
// --ai names (claude by default; woken-ai.mjs): the AI opens its session, takes what waits and ends its
// session once nothing waits. So a click needs no prompt. Start it as the
// `wake.command` start_evolution_session answers: it carries --url and, where
// sign-in is enforced, a --token that can only wait for this person's wakes on
// this project (criterion ab716003). --detach runs it apart from the
// conversation that started it, writing .lyriks/waker.pid and appending to
// .lyriks/waker.log, and replaces a waker already running here. One woken AI
// at a time: a wake that comes while one runs starts the next once it exited.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';
import { cliNamed, findMcpServer, startWokenAi } from './woken-ai.mjs';

const USAGE =
	'Usage: wake-ai.mjs <project_id> [--detach] [--once] [--ai claude|codex|gemini|copilot] [--url URL] [--token TOKEN] [--mcp-server NAME] [--allow-api-key], or wake-ai.mjs --status | --stop';
/** Under the 50 s the MCP server allows one call that sends no progress token. */
const HOLD_SECONDS = 45;
const STATE_DIR = '.lyriks';
const PID_FILE = join(STATE_DIR, 'waker.pid');
const LOG_FILE = join(STATE_DIR, 'waker.log');
/**
 * The first pause after Lyriks did not answer, and the longest: a waker waits
 * through a deploy or a sleeping laptop for as long as it takes, every
 * RETRY_MAX_MS at worst, since it is meant to outlive them.
 */
const RETRY_FIRST_MS = Number(process.env.LYRIKS_AWAIT_RETRY_MS) > 0 ? Number(process.env.LYRIKS_AWAIT_RETRY_MS) : 2_000;
const RETRY_MAX_MS = RETRY_FIRST_MS * 15;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AWAY = /MCP endpoint answered 50[234]\b|MCP endpoint never answered request|\blyriks 50[234]\b|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|other side closed|terminated/i;
const lyriksAway = (error) => error instanceof Error && error.status === undefined && AWAY.test(`${error.message} ${error.cause?.code ?? ''}`);
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

function readPid() {
	if (!existsSync(PID_FILE)) return null;
	try {
		return JSON.parse(readFileSync(PID_FILE, 'utf8'));
	} catch {
		return null;
	}
}

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function stopRunning() {
	const running = readPid();
	rmSync(PID_FILE, { force: true });
	if (!running || !alive(running.pid)) return null;
	process.kill(running.pid, 'SIGTERM');
	return running;
}

/** Start the waker apart from this process, replacing the one running here. */
function detach(argv, projectId) {
	mkdirSync(STATE_DIR, { recursive: true });
	const replaced = stopRunning();
	appendFileSync(LOG_FILE, '');
	const out = openSync(LOG_FILE, 'a');
	const script = fileURLToPath(import.meta.url);
	const child = spawn(process.execPath, [script, ...argv.filter((arg) => arg !== '--detach')], { detached: true, stdio: ['ignore', out, out], cwd: process.cwd(), env: process.env });
	child.unref();
	writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, projectId, startedAt: new Date().toISOString() }));
	const said = replaced ? 'The waker was restarted' : 'The waker listens';
	console.log(`${said} on ${projectId}: the person's next click wakes their AI when none is in session. Log: ${LOG_FILE}; stop it with node .lyriks/tools/wake-ai.mjs --stop.`);
	return 0;
}

/** Listen for wakes and start one woken AI at a time. */
async function listen(projectId, flags) {
	const ai = flags.ai || 'claude';
	const cli = cliNamed(ai);
	const endpoint = resolveEndpoint(flags);
	const mcpServer = flags['mcp-server'] || findMcpServer(ai, endpoint.url);
	const allowApiKey = flags['allow-api-key'] === true;
	log(`Listening for wakes on ${projectId} through ${endpoint.url} (MCP server "${mcpServer}" in ${cli.name}).`);
	let woken = null;
	let queued = 0;
	let stopping = false;
	let settled = () => {};
	const finish = () => {
		if (readPid()?.pid === process.pid) rmSync(PID_FILE, { force: true });
	};
	for (const signal of ['SIGTERM', 'SIGINT']) {
		process.on(signal, () => {
			stopping = true;
			woken?.kill('SIGTERM');
			finish();
			process.exit(0);
		});
	}
	const start = (clicks) =>
		startWokenAi({
			ai,
			projectId,
			clicks,
			mcpServer,
			allowApiKey,
			log,
			onExit: (code) => {
				log(`The woken AI exited (${code ?? 'signal'}).`);
				woken = null;
				if (queued > 0 && !stopping) {
					const next = queued;
					queued = 0;
					woken = start(next);
				}
				if (!woken) settled();
			}
		});

	let session = null;
	let pause = RETRY_FIRST_MS;
	for (;;) {
		let answer;
		try {
			session ??= await openSession(endpoint);
			answer = await callToolJson(session, 'await_ai_wake', { project_id: projectId, max_wait_seconds: HOLD_SECONDS });
		} catch (error) {
			if (!lyriksAway(error)) {
				finish();
				const why = error instanceof Error ? error.message : String(error);
				throw new Error(`${why}\nThe waker stops: when its sign-in ran out or was refused, open a session from the prompt; its answer carries a new waking command.`);
			}
			// A restarted gateway knows no session of before: open a new one, after a pause.
			session = null;
			await sleep(pause);
			pause = Math.min(pause * 2, RETRY_MAX_MS);
			continue;
		}
		pause = RETRY_FIRST_MS;
		if (!answer || answer.kind !== 'wake') continue;
		const clicks = Number(answer.clicks) > 0 ? Number(answer.clicks) : 1;
		if (woken) {
			// One woken AI at a time: this one starts once the running one exited.
			queued = clicks;
			log('A wake came while the woken AI still runs: it starts once that one exited.');
		} else {
			woken = start(clicks);
		}
		if (flags.once) {
			if (woken) await new Promise((resolve) => (settled = resolve));
			finish();
			return 0;
		}
	}
}

runScript(async () => {
	const argv = process.argv.slice(2);
	const { positional, flags } = parseArgs(argv, [...ENDPOINT_FLAGS, 'mcp-server', 'ai']);
	if (flags.status) {
		const running = readPid();
		const up = !!running && alive(running.pid);
		console.log(JSON.stringify(up ? { running: true, ...running, log: LOG_FILE } : { running: false }));
		return 0;
	}
	if (flags.stop) {
		const stopped = stopRunning();
		console.log(stopped ? `The waker of ${stopped.projectId} stopped: a click no longer wakes your AI.` : 'No waker runs here.');
		return 0;
	}
	const [projectId] = positional;
	if (!projectId) throw new Error(USAGE);
	// A CLI the waker cannot start is refused here, before it detaches.
	cliNamed(flags.ai || 'claude');
	if (flags.detach) return detach(argv, projectId);
	return listen(projectId, flags);
});
