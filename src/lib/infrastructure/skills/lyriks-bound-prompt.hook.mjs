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
// rather than go looking for a spec it cannot read. No dependencies, no
// network, well under 100 ms.
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

const isLyriksTool = (name) => typeof name === 'string' && (name.startsWith('mcp__lyriks') || name.startsWith('mcp__unspa'));

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

/** The last project_id handed to a Lyriks/unspa MCP tool in this session, from the transcript. */
function projectFromTranscript(lines) {
	let project = null;
	for (const line of lines) {
		if (!line.includes('mcp__lyriks') && !line.includes('mcp__unspa')) continue;
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
		if (line.includes('mcp__lyriks') || line.includes('mcp__unspa')) {
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
		`Lyriks-bound repository${where}: this request goes through the Lyriks MCP without being asked. ` +
		'If it changes what the product does: spec first (apply_behavior_batch / patch_section / build_screen), ' +
		'then the code, then the index sync (sync_implementation_index), in this same turn. An Evolution request ' +
		'(get_evolution / apply_evolution_batch) is optional: open one only when the person asks for it or asks ' +
		'for a change to be qualified before it is decided. ' +
		'If it asks how the product ' +
		'behaves, whether it is right, what is missing or what broke: read the spec first (get_behavior_feature, ' +
		'get_section, get_implementation_status / gaps / drift, simulate_experience / verify_experience). ' +
		'Only work with no user-visible effect skips the spec; say so in one line.';
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context }
		}) + '\n'
	);
}

main();
