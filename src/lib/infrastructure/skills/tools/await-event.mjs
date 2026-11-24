#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/await-event.mjs <project_id> <request_id | -> <session_id> [--hold SECONDS] [--url URL] [--token TOKEN]
// A dash in place of the request waits in the session of the whole project (feat-ai-session).
// Waits, in a live Evolution session, for the person's next event on the
// request page (a click, their own progress, the end of the session) and exits
// printing it as JSON. Run it in the background (Claude Code: Bash with
// run_in_background): a held tool call keeps the person's chat messages from
// reaching the agent, a background command does not, and the agent is woken
// when it ends. A script sends no progress notification, so it waits in short
// holds and calls again at once while nothing comes. Run it as the
// `wait.command` start_evolution_session answers: that command carries --url
// and, where the deployment enforces sign-in, a --token ticket that can only
// wait in that session, so nobody sets anything (criterion 26c95cc1).
// LYRIKS_MCP_URL and LYRIKS_MCP_TOKEN still work for a hand-made call.
// A restart of Lyriks (a deploy, an update) does not end the wait: the command
// opens its connection again and waits on, after 2 s, then twice as long each
// time up to 30 s, for 10 minutes at most; a refused sign-in still ends it at
// once (criterion d3916c06).
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

const USAGE = 'Usage: await-event.mjs <project_id> <request_id | -> <session_id> [--hold SECONDS] [--url URL] [--token TOKEN]';
/** Under the 50 s the MCP server allows one call that sends no progress token. */
const DEFAULT_HOLD = 45;
/** One wait of the MCP server on the platform, its longest. */
const MAX_HOLD = 240;
/**
 * Provisional constants waitRetryFirstSeconds (2), waitRetryMaxSeconds (30) and
 * waitThroughRestartSeconds (600): the first pause after Lyriks did not answer,
 * the longest one, and how long it may stay away before the command gives up.
 * LYRIKS_AWAIT_RETRY_MS sets the first pause; the other two keep their ratio.
 */
const RETRY_FIRST_MS = Number(process.env.LYRIKS_AWAIT_RETRY_MS) > 0 ? Number(process.env.LYRIKS_AWAIT_RETRY_MS) : 2_000;
const RETRY_MAX_MS = RETRY_FIRST_MS * 15;
const RETRY_FOR_MS = RETRY_FIRST_MS * 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * What says nothing about the wait, only that Lyriks is restarting or busy: the
 * gateway answered 502, 503 or 504, the connection failed, the held call's
 * stream ended without its answer (the platform behind the gateway restarted
 * under it, seen on lab), or the wait reported the platform unreachable. A
 * refused sign-in (401, 403, with its status) and a refusal of the wait itself
 * are never one.
 */
const AWAY = /MCP endpoint answered 50[234]\b|MCP endpoint never answered request|\blyriks 50[234]\b|fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed|terminated/i;
const lyriksAway = (error) => error instanceof Error && error.status === undefined && AWAY.test(`${error.message} ${error.cause?.code ?? ''}`);

runScript(async () => {
	const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'hold']);
	const [project_id, request_id, session_id] = positional;
	if (!project_id || !request_id || !session_id) throw new Error(USAGE);
	const hold = flags.hold === undefined ? DEFAULT_HOLD : Number(flags.hold);
	if (!Number.isInteger(hold) || hold < 1 || hold > MAX_HOLD) throw new Error(`--hold takes a whole number of seconds from 1 to ${MAX_HOLD}.`);
	const endpoint = resolveEndpoint(flags);
	const args = { project_id, ...(request_id === '-' ? {} : { request_id }), session_id, max_wait_seconds: hold };
	let session = null;
	let awaySince = null;
	let pause = RETRY_FIRST_MS;
	for (;;) {
		let event;
		try {
			session ??= await openSession(endpoint);
			event = await callToolJson(session, 'await_evolution_event', args);
		} catch (error) {
			if (!lyriksAway(error)) throw error;
			awaySince ??= Date.now();
			if (Date.now() - awaySince >= RETRY_FOR_MS) {
				throw new Error(`Lyriks did not come back within ${Math.round(RETRY_FOR_MS / 60_000)} minutes: ${error.message}`);
			}
			// A restarted gateway knows no session of before: open a new one.
			session = null;
			await sleep(pause);
			pause = Math.min(pause * 2, RETRY_MAX_MS);
			continue;
		}
		awaySince = null;
		pause = RETRY_FIRST_MS;
		// Nothing yet: wait again at once. A cancellation travels even with nothing, and the agent must hear it.
		if (event && event.kind === 'nothing' && !event.cancelled) continue;
		console.log(JSON.stringify(event, null, 2));
		return 0;
	}
});
