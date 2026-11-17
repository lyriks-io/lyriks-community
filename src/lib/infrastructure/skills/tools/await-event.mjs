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
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';

const USAGE = 'Usage: await-event.mjs <project_id> <request_id | -> <session_id> [--hold SECONDS] [--url URL] [--token TOKEN]';
/** Under the 50 s the MCP server allows one call that sends no progress token. */
const DEFAULT_HOLD = 45;
/** One wait of the MCP server on the platform, its longest. */
const MAX_HOLD = 240;

runScript(async () => {
	const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'hold']);
	const [project_id, request_id, session_id] = positional;
	if (!project_id || !request_id || !session_id) throw new Error(USAGE);
	const hold = flags.hold === undefined ? DEFAULT_HOLD : Number(flags.hold);
	if (!Number.isInteger(hold) || hold < 1 || hold > MAX_HOLD) throw new Error(`--hold takes a whole number of seconds from 1 to ${MAX_HOLD}.`);
	const session = await openSession(resolveEndpoint(flags));
	for (;;) {
		const event = await callToolJson(session, 'await_evolution_event', { project_id, ...(request_id === '-' ? {} : { request_id }), session_id, max_wait_seconds: hold });
		// Nothing yet: wait again at once. A cancellation travels even with nothing, and the agent must hear it.
		if (event && event.kind === 'nothing' && !event.cancelled) continue;
		console.log(JSON.stringify(event, null, 2));
		return 0;
	}
});
