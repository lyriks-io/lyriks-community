// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Not run
// directly: how the person's waker (wake-ai.mjs) starts their AI without a
// window once a click of theirs waits and none of their AIs is in session
// (feat-ai-session, "Wake my AI"), whichever CLI that AI is (woken-clis.mjs:
// Claude Code, Codex, Gemini CLI, GitHub Copilot CLI). The woken AI runs on the
// plan the person signed in to that CLI with: the variables that would bill an
// API key are removed from its environment unless the waker was started with
// --allow-api-key (criterion 2c01fb5f). It may use the Lyriks MCP and read the
// code; it never edits a file of the repository (criterion 47d4a354).
import { spawn } from 'node:child_process';
import { CLIS } from './woken-clis.mjs';

/** The CLIs the waker can start, by the name --ai takes. */
export const WAKER_CLIS = Object.keys(CLIS);

/** The command of a CLI: its own name, or LYRIKS_WAKER_COMMAND (a full path, or a test double). */
const commandOf = (cli) => process.env.LYRIKS_WAKER_COMMAND || cli.command;

/** What the woken AI runs with: the person's environment, less the API keys of its CLI unless they allowed them. */
function wokenEnvironment(cli, env, allowApiKey) {
	const out = { ...env };
	if (!allowApiKey) for (const name of cli.apiKeys) delete out[name];
	return out;
}

/** What the woken AI is told: it has no chat, so it waits in the foreground and stops once nothing waits. */
function wakePrompt(cli, projectId, clicks) {
	return [
		`The Lyriks waker started you: ${clicks === 1 ? 'a click' : `${clicks} clicks`} of the person wait${clicks === 1 ? 's' : ''} for their AI on the Lyriks project ${projectId}, and none of their AIs is in session. Nobody reads this run: it has no chat.`,
		`1. Open your session: start_evolution_session with project_id "${projectId}" and client "${cli.name} (woken)". Never run its wake.command: the waker that started you is already running.`,
		'2. Take what waits with await_evolution_event (project_id, session_id, max_wait_seconds 45), called directly: this run has no chat to keep free, so never run the waiting script. Answer each click as its next and answerWith say, then call await_evolution_event again.',
		'3. You may use the Lyriks MCP tools and read the code, and, where your tools allow it, its git history and the scripts of .lyriks/tools that only send to Lyriks. Never edit a file of this repository and never run another command: a change to the code waits for a session the person opens themselves, so say so in your answer when a click asks for one.',
		'4. When await_evolution_event answers kind "nothing" twice in a row, nothing waits for you: end your session (update_evolution_session with end: true) and stop. When it answers kind "ended", stop.',
		"5. Before you stop for any other reason, say why on the person's pages (update_evolution_session with stopped)."
	].join('\n');
}

/** The CLI --ai names, refused with the ones the waker knows when it is none of them. */
export function cliNamed(ai) {
	const cli = CLIS[ai];
	if (!cli) throw new Error(`--ai is one of ${WAKER_CLIS.join(', ')}: the CLI of the AI that opened the session.`);
	return cli;
}

/** The name the CLI's own configuration gives the Lyriks MCP at this address. */
export function findMcpServer(ai, url) {
	const cli = cliNamed(ai);
	const name = cli.server(commandOf(cli), url);
	if (!name) throw new Error(`No MCP server of ${cli.name} points at ${url}: pass --mcp-server <name>, the name its configuration gives the Lyriks MCP.`);
	return name;
}

/**
 * Start the woken AI in this repository, saying in the log which sign-in it
 * runs on; null when the CLI is not signed in, or signed in with an API key
 * alone, and no API key was allowed: the wake then runs out and the person's
 * page offers the prompt.
 */
export function startWokenAi({ ai, projectId, clicks, mcpServer, allowApiKey, log, onExit }) {
	const cli = cliNamed(ai);
	const command = commandOf(cli);
	const env = wokenEnvironment(cli, process.env, allowApiKey);
	const signIn = cli.signIn(command, env);
	if (!allowApiKey && signIn.apiKeyOnly) {
		log(`${cli.name} is signed in with an API key only: sign in with your plan, or start the waker with --allow-api-key. The page offers the prompt once the wake runs out.`);
		return null;
	}
	if (!allowApiKey && !signIn.loggedIn) {
		log(`${cli.name} is not signed in: run it once and sign in. The page offers the prompt once the wake runs out.`);
		return null;
	}
	const billed = allowApiKey && cli.apiKeys.some((name) => env[name]) ? 'an API key (--allow-api-key)' : signIn.method;
	log(`Woke ${cli.name} for ${clicks} waiting click${clicks === 1 ? '' : 's'}; sign-in: ${billed}.`);
	const child = spawn(command, cli.args(wakePrompt(cli, projectId, clicks), mcpServer, allowApiKey), { cwd: process.cwd(), env, stdio: ['ignore', 'inherit', 'inherit'] });
	let done = false;
	const finish = (code) => {
		if (done) return;
		done = true;
		onExit(code);
	};
	child.on('error', (error) => {
		log(`${cli.name} could not start: ${error.message}. Set LYRIKS_WAKER_COMMAND to its full path.`);
		finish(null);
	});
	child.on('exit', (code) => finish(code));
	return child;
}
