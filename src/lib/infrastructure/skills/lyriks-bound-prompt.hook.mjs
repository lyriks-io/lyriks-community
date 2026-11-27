#!/usr/bin/env node
// Lyriks binding hook (Claude Code, UserPromptSubmit). Installed into a
// repository by `sync_skills` next to the Lyriks skills, wired in
// .claude/settings.json. Its presence means this repository's product is
// specified in Lyriks: on EVERY prompt it restates that the request goes
// through the Lyriks MCP (spec first for anything that changes what
// the product does, a spec read first for a question), and names the project
// when it can find it (the last project_id
// a Lyriks tool was given in this session, else the binding block in
// CLAUDE.md). When the last Lyriks tool call of the session failed because the
// server could not be reached, it says so first: the agent must tell the person
// rather than go looking for a spec it cannot read. While no live session of
// the agent is open on the project in this conversation, it also says when to
// open one in the background (ac-ai-session-auto-open): when the work calls for
// it, and at the latest in the turn the agent hands the person a link to the
// app, never merely because it uses the MCP; never once the person ended it,
// nor when LYRIKS_NO_AUTO_SESSION=1. No dependencies, no network, well under 100 ms.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readStdin() {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

/** The session transcript, one line per entry, or none. */
function transcriptLines(path) {
	if (!path || !existsSync(path)) return [];
	try {
		return readFileSync(path, 'utf8').split('\n');
	} catch {
		return [];
	}
}

/** The server and the tool of an MCP tool name (`mcp__<server>__<tool>`), or null for any other tool. */
function mcpTool(name) {
	if (typeof name !== 'string' || !name.startsWith('mcp__')) return null;
	const rest = name.slice('mcp__'.length);
	// A tool name never holds a double underscore; a server name may.
	const cut = rest.lastIndexOf('__');
	return cut > 0 ? { server: rest.slice(0, cut), tool: rest.slice(cut + 2) } : null;
}

/** A Lyriks server holds lyriks anywhere in its name, whatever the case: the one rule both Lyriks hooks use. */
const isLyriksServer = (server) => /lyriks/i.test(server);

/** Whether a tool belongs to a Lyriks server, a claude.ai connector named Lyriks included. */
function isLyriksTool(name) {
	const call = mcpTool(name);
	return call !== null && isLyriksServer(call.server);
}

/** A cheap first look at a transcript line: could it hold a call to a Lyriks server? */
const MAY_CALL_LYRIKS = /mcp__[^"]*lyriks/i;

/** The content items of an assistant transcript line, or none. */
function assistantItems(line) {
	let entry;
	try {
		entry = JSON.parse(line);
	} catch {
		return [];
	}
	if (!entry || entry.type !== 'assistant') return [];
	const content = entry.message && entry.message.content;
	return Array.isArray(content) ? content : [];
}

/** The last project_id handed to a Lyriks MCP tool in this session, from the transcript. */
function projectFromTranscript(lines) {
	let project = null;
	for (const line of lines) {
		if (!MAY_CALL_LYRIKS.test(line)) continue;
		for (const item of assistantItems(line)) {
			if (!item || item.type !== 'tool_use' || !isLyriksTool(item.name)) continue;
			const args = item.input;
			const id = args && (args.project_id || args.projectId);
			if (typeof id === 'string' && id.trim()) project = id.trim();
		}
	}
	return project;
}

// What a Lyriks tool result says when the server itself could not be reached,
// as opposed to a tool that ran and refused its arguments.
const UNREACHABLE = [
	[/ECONNREFUSED/i, 'connection refused'],
	[/ECONNRESET|socket hang up/i, 'connection reset'],
	[/ETIMEDOUT/, 'connection timed out'],
	[/ENOTFOUND|EAI_AGAIN/i, 'host not found'],
	[/fetch failed/i, 'fetch failed'],
	[/not connected|connection closed|no such tool available/i, 'server not connected'],
	[/-32000\b/, 'MCP error -32000'],
	[/bad gateway|service unavailable|gateway time-?out|server (is )?unavailable|mcp_unavailable/i, 'server unavailable']
];

function resultText(content) {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join(' ');
}

/**
 * The last Lyriks tool call that failed because the server was unreachable,
 * unless a later Lyriks call came back from it: { at, reason } or null. A tool
 * result names no tool, so it is matched to its call by id, and only the
 * results of Lyriks calls are parsed.
 */
function mcpOutage(lines) {
	const calls = new Set();
	let outage = null;
	for (const line of lines) {
		if (MAY_CALL_LYRIKS.test(line)) {
			for (const item of assistantItems(line)) {
				if (item && item.type === 'tool_use' && isLyriksTool(item.name) && typeof item.id === 'string') calls.add(item.id);
			}
		}
		if (calls.size === 0 || !line.includes('"tool_result"')) continue;
		const ids = [...line.matchAll(/"tool_use_id":"([^"]+)"/g)].map((match) => match[1]);
		if (!ids.some((id) => calls.has(id))) continue;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		const content = entry && entry.message && entry.message.content;
		for (const item of Array.isArray(content) ? content : []) {
			if (!item || item.type !== 'tool_result' || !calls.has(item.tool_use_id)) continue;
			const text = resultText(item.content);
			const found = item.is_error === true ? UNREACHABLE.find(([pattern]) => pattern.test(text)) : undefined;
			// Any other answer, an error included, came from a server that was there.
			outage = found ? { at: typeof entry.timestamp === 'string' ? entry.timestamp : null, reason: found[1] } : null;
		}
	}
	return outage;
}

// An event the waiting call or the background waiter printed, as it reads in the
// transcript: JSON that may sit escaped inside another JSON string.
const ENDED_EVENT = /\\?"kind\\?"\s*:\s*\\?"ended\\?"/;
const ENDED_REASON = /\\?"reason\\?"\s*:\s*\\?"([a-z_]+)\\?"/;

/**
 * Where the agent's live session of this conversation stands
 * (ac-ai-session-auto-open): { kind: 'none' } before any session was opened or
 * when opening failed, { kind: 'open' } once start_evolution_session was
 * called and nothing ended it since, { kind: 'ended', reason } once an event
 * said it ended (whether the waiting call or the background waiter printed it)
 * or the agent ended it on the person's word (update_evolution_session end).
 */
function liveSessionState(lines) {
	const starts = new Set();
	let state = { kind: 'none' };
	for (const line of lines) {
		if (MAY_CALL_LYRIKS.test(line)) {
			for (const item of assistantItems(line)) {
				if (!item || item.type !== 'tool_use' || !isLyriksTool(item.name)) continue;
				if (item.name.endsWith('__start_evolution_session')) {
					if (typeof item.id === 'string') starts.add(item.id);
					state = { kind: 'open' };
				} else if (item.name.endsWith('__update_evolution_session') && item.input && item.input.end === true) {
					state = { kind: 'ended', reason: 'ended_by_person' };
				}
			}
		}
		if (state.kind !== 'open') continue;
		if (starts.size > 0 && line.includes('"tool_result"') && line.includes('"is_error":true')) {
			let entry;
			try {
				entry = JSON.parse(line);
			} catch {
				entry = null;
			}
			const content = entry && entry.message && entry.message.content;
			const failed = (Array.isArray(content) ? content : []).some((item) => item && item.type === 'tool_result' && starts.has(item.tool_use_id) && item.is_error === true);
			if (failed) {
				state = { kind: 'none' };
				continue;
			}
		}
		if (ENDED_EVENT.test(line)) {
			const reason = ENDED_REASON.exec(line);
			state = { kind: 'ended', reason: reason ? reason[1] : 'unknown' };
		}
	}
	return state;
}

/**
 * When and how to open the session, or nothing (ac-ai-session-auto-open). The
 * hook cannot know whether this turn will hand the person a link, so it states
 * the rule instead of asking for a session at every prompt: a session opened
 * for a read or a write alone was noise the person never asked for.
 */
function autoSessionInstruction(project, lines, env) {
	if (!project || env.LYRIKS_NO_AUTO_SESSION === '1') return '';
	const state = liveSessionState(lines);
	if (state.kind === 'open' || (state.kind === 'ended' && state.reason === 'ended_by_person')) return '';
	return (
		` No live session of yours is open on ${project}. Do not open one merely because you use the Lyriks MCP: open it when the work calls for it, ` +
		'and at the latest in the turn you hand the person a link to the app (an href a Lyriks answer carries, handed whenever a page serves them ' +
		'better than the chat), before that link; also when they ask to work with you on the pages, or when you ask them something they answer on a page. ' +
		'Open it in the background, without a word in the chat unless it fails: ' +
		`call start_evolution_session with project_id ${project} alone, then run the wait.command it answers (node .lyriks/tools/await-event.mjs ${project} - <session_id> ...) ` +
		'as given, with run_in_background: it signs in by itself, nothing to set; handle each event it prints, then run it again. ' +
		'Never hold await_evolution_event in the foreground.'
	);
}

/** `2026-09-24T10:12:03.120Z` as `2026-09-24 10:12 UTC`, anything else as is. */
function when(timestamp) {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(timestamp || '');
	return match ? `${match[1]} ${match[2]} UTC` : 'an unknown time';
}

/** The project named by the binding block sync_skills merged into CLAUDE.md, when it named one. */
function projectFromBindingBlock(cwd) {
	for (const file of ['CLAUDE.md', 'AGENTS.md']) {
		const path = join(cwd, file);
		if (!existsSync(path)) continue;
		let body;
		try {
			body = readFileSync(path, 'utf8');
		} catch {
			continue;
		}
		const block = /<!-- lyriks-binding -->([\s\S]*?)<!-- \/lyriks-binding -->/.exec(body);
		if (!block) continue;
		const named = /Lyriks project `([^`]+)`/.exec(block[1]);
		if (named) return named[1];
	}
	return null;
}

/**
 * A harness event delivered on the prompt channel (a background task that
 * finished, a system reminder) is not a request about the product: restating
 * the binding there sends the agent to read the spec for nothing.
 */
function isHarnessEvent(prompt) {
	if (typeof prompt !== 'string') return false;
	const head = prompt.trimStart().slice(0, 200);
	return (
		head.startsWith('<task-notification>') ||
		head.startsWith('<system-reminder>') ||
		head.startsWith('[SYSTEM NOTIFICATION')
	);
}

function main() {
	let payload = {};
	try {
		payload = JSON.parse(readStdin() || '{}');
	} catch {
		payload = {};
	}
	if (isHarnessEvent(payload.prompt)) return;
	const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
	const lines = transcriptLines(typeof payload.transcript_path === 'string' ? payload.transcript_path : '');
	const project = projectFromTranscript(lines) || projectFromBindingBlock(cwd);
	const outage = mcpOutage(lines);
	const down = outage
		? `The Lyriks MCP failed at ${when(outage.at)} (${outage.reason}) and no Lyriks call has succeeded since: ` +
			'tell the person now and point them to /mcp to reconnect it; do not guess specified behavior from the code meanwhile. '
		: '';
	const where = project ? ` (project ${project})` : '';
	const context =
		down +
		`Lyriks-bound repository${where}: a request about what this product does goes through the Lyriks MCP without being asked. ` +
		'If it changes what the product does: spec first (apply_behavior_batch / patch_section), ' +
		'then the code, then the index sync (sync_implementation_index), in this same turn. An Evolution request ' +
		'(get_evolution / apply_evolution_batch) is optional: open one only when the person asks for it or asks ' +
		'for a change to be qualified before it is decided. ' +
		'If it asks how the product ' +
		'behaves, whether it is right, what is missing or what broke: read the spec first (get_behavior_feature, ' +
		'get_section, get_implementation_status / gaps / drift, simulate_behavior), then follow the places in the code it ' +
		'gives into your own code tools (search, code search, code graph, editor) and tell the person where the code ' +
		'does otherwise. A question about the code alone (how to call an API, an internal mechanism, a library) goes ' +
		'to your code tools directly, without a Lyriks call. ' +
		'Only work with no user-visible effect skips the spec; say so in one line. ' +
		// The person follows a run, a request or a session on their pages and never sees this chat (rule f26545fa).
		'When the person follows your work on their pages (a Reverse-Specification, an Evolution request, your session on the project): ' +
		'before ending a turn on a question, or stopping for any other reason, say it there first with update_evolution_session ' +
		'(ask for the one question you wait on, stopped for why you stop), opening your session with start_evolution_session given ' +
		'the project alone when none is open, then wait in the background.' +
		autoSessionInstruction(project, lines, process.env);
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context }
		}) + '\n'
	);
}

main();
