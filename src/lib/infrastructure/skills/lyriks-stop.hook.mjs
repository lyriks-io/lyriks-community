#!/usr/bin/env node
// Lyriks end-of-turn hook (Claude Code, Stop): "End a turn in a bound
// repository" (action 900dbea1, criterion 7b37377d). Installed into a
// repository by `sync_skills` next to the binding hook, wired in
// .claude/settings.json. When the person follows the AI's work on their pages
// (a Reverse-Specification, an Evolution request, the live session), an AI
// that ends its turn on a question in its client's chat, or stops without a
// word and without waiting for them in the background, leaves them waiting on
// nothing: the hook holds that turn once and tells the AI to say it on the
// person's pages first (update_evolution_session ask or stopped). It never
// holds a turn twice (stop_hook_active), so an AI that cannot reach Lyriks is
// never trapped, and LYRIKS_NO_STOP_HOOK=1 switches it off. No dependencies,
// no network, well under 100 ms.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readStdin() {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

function transcriptEntries(path) {
	if (!path || !existsSync(path)) return [];
	let raw = '';
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return [];
	}
	const entries = [];
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {
			// A line cut by a write in progress is no entry.
		}
	}
	return entries;
}

/** The tool of a Lyriks MCP call (`mcp__<server holding lyriks>__<tool>`), else null: the rule both binding hooks use. */
function lyriksTool(name) {
	if (typeof name !== 'string' || !name.startsWith('mcp__')) return null;
	const rest = name.slice('mcp__'.length);
	const cut = rest.lastIndexOf('__');
	if (cut <= 0 || !/lyriks/i.test(rest.slice(0, cut))) return null;
	return rest.slice(cut + 2);
}

const contentOf = (entry) => (entry && entry.message && entry.message.content) ?? null;

/** Whether a user entry is a prompt (the person's, or a harness event), not only tool results. */
function isPrompt(entry) {
	if (!entry || entry.type !== 'user') return false;
	const content = contentOf(entry);
	if (typeof content === 'string') return true;
	return Array.isArray(content) && content.some((item) => item && item.type === 'text');
}

/** The Lyriks work the person follows on their pages: a Reverse-Specification, an Evolution request, the live session. */
const FOLLOWED = new Set([
	'report_retrospec_reading',
	'finalize_analysis',
	'finish_project',
	'get_evolution',
	'apply_evolution_batch',
	'start_evolution_session',
	'await_evolution_event'
]);
const WAIT_SCRIPT = /await-event\.mjs/;

/** The project the conversation's Lyriks calls named last, for the instruction. */
function projectOf(entries) {
	let project = null;
	for (const entry of entries) {
		if (!entry || entry.type !== 'assistant' || !Array.isArray(contentOf(entry))) continue;
		for (const item of contentOf(entry)) {
			if (!item || item.type !== 'tool_use' || !lyriksTool(item.name)) continue;
			const id = item.input && (item.input.project_id || item.input.projectId);
			if (typeof id === 'string' && id.trim()) project = id.trim();
		}
	}
	return project;
}

/** Whether a session of the AI is open in this conversation: opened, and neither ended by the person nor said ended since. */
function sessionOpen(entries) {
	let open = false;
	for (const entry of entries) {
		const content = contentOf(entry);
		if (entry && entry.type === 'assistant' && Array.isArray(content)) {
			for (const item of content) {
				const tool = item && item.type === 'tool_use' ? lyriksTool(item.name) : null;
				if (tool === 'start_evolution_session') open = true;
				else if (tool === 'update_evolution_session' && item.input && item.input.end === true) open = false;
			}
		}
		if (open && JSON.stringify(content ?? '').match(/\\?"kind\\?"\s*:\s*\\?"ended\\?"/)) open = false;
	}
	return open;
}

/** Which tool calls of the turn came back as errors, by call id. */
function failedCalls(turn) {
	const failed = new Set();
	for (const entry of turn) {
		const content = contentOf(entry);
		if (!entry || entry.type !== 'user' || !Array.isArray(content)) continue;
		for (const item of content) if (item && item.type === 'tool_result' && item.is_error === true) failed.add(item.tool_use_id);
	}
	return failed;
}

/** The last paragraph of what the AI wrote last in the chat, code and addresses left out. */
function lastWords(turn) {
	for (let i = turn.length - 1; i >= 0; i--) {
		const entry = turn[i];
		const content = contentOf(entry);
		if (!entry || entry.type !== 'assistant' || !Array.isArray(content)) continue;
		const text = content
			.filter((item) => item && item.type === 'text' && typeof item.text === 'string')
			.map((item) => item.text)
			.join('\n')
			.trim();
		if (!text) continue;
		const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ');
		const paragraphs = plain.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
		return paragraphs[paragraphs.length - 1] ?? '';
	}
	return '';
}

/**
 * What the turn did with the person's pages: whether it worked on what they
 * follow there, said its question or its stop there (and Lyriks took it),
 * ended by waiting for them in the background, and ended its chat on a
 * question.
 */
export function readTurn(entries) {
	let start = 0;
	for (let i = entries.length - 1; i >= 0; i--) {
		if (isPrompt(entries[i])) {
			start = i;
			break;
		}
	}
	const turn = entries.slice(start);
	const failed = failedCalls(turn);
	let step = 0;
	let followed = false;
	let lastWork = -1;
	let lastTold = -1;
	let lastWait = -1;
	for (const entry of turn) {
		const content = contentOf(entry);
		if (!entry || entry.type !== 'assistant' || !Array.isArray(content)) continue;
		for (const item of content) {
			if (!item || item.type !== 'tool_use') continue;
			step += 1;
			const input = item.input ?? {};
			const tool = lyriksTool(item.name);
			if (item.name === 'Bash' && typeof input.command === 'string' && WAIT_SCRIPT.test(input.command)) {
				followed = true;
				lastWait = step;
				continue;
			}
			if (!tool) continue;
			if (FOLLOWED.has(tool)) followed = true;
			if (tool === 'await_evolution_event') lastWait = step;
			else if (tool === 'update_evolution_session') {
				const said = (typeof input.ask === 'string' && input.ask.trim()) || (typeof input.stopped === 'string' && input.stopped.trim());
				if (said && !failed.has(item.id)) lastTold = step;
			} else lastWork = step;
		}
	}
	const words = lastWords(turn);
	return {
		followed: followed || sessionOpen(entries),
		toldPerson: lastTold > lastWork,
		// A turn that did nothing on Lyriks leaves the wait it found as it was.
		waitsInBackground: lastWork === -1 || lastWait > lastWork,
		endsOnQuestion: /\?/.test(words)
	};
}

/** Whether the hook holds the turn (rule 6d2208a2). */
export function holds(turn, heldBefore, env) {
	if (heldBefore || env.LYRIKS_NO_STOP_HOOK === '1') return false;
	if (!turn.followed || turn.toldPerson) return false;
	return turn.endsOnQuestion || !turn.waitsInBackground;
}

function instruction(project) {
	const open = project
		? `start_evolution_session with project_id ${project} alone`
		: 'start_evolution_session given the project alone';
	return (
		'The person follows this work on their pages, and they cannot see this chat from there. Before you stop, say it on their pages: ' +
		'update_evolution_session with ask (the one question you wait on, in their language) or stopped (why you stop: the work is done, ' +
		`you are blocked, an error, a limit), after ${open} if no session of yours is open; then run its wait.command in the background ` +
		'so their answer reaches you. Then end your turn with one line saying where they will find it.'
	);
}

function main() {
	let payload = {};
	try {
		payload = JSON.parse(readStdin() || '{}');
	} catch {
		payload = {};
	}
	const entries = transcriptEntries(typeof payload.transcript_path === 'string' ? payload.transcript_path : '');
	if (!holds(readTurn(entries), payload.stop_hook_active === true, process.env)) return;
	process.stdout.write(JSON.stringify({ decision: 'block', reason: instruction(projectOf(entries)) }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
