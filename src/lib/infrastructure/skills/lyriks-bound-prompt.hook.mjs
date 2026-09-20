#!/usr/bin/env node
// Lyriks binding hook (Claude Code, UserPromptSubmit). Installed into a
// repository by `sync_skills` next to the Lyriks skills, wired in
// .claude/settings.json. Its presence means this repository's product is
// specified in Lyriks: on EVERY prompt it restates that the request goes
// through the Lyriks MCP (spec first for a change to make, Evolution for a
// change to qualify, spec read first for a question), and names the project
// when it can find it (the last project_id
// a Lyriks tool was given in this session, else the binding block in
// CLAUDE.md). No dependencies, no network, well under 100 ms.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readStdin() {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

/** The last project_id handed to a Lyriks/unspa MCP tool in this session, from the transcript. */
function projectFromTranscript(path) {
	if (!path || !existsSync(path)) return null;
	let project = null;
	let text;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return null;
	}
	for (const line of text.split('\n')) {
		if (!line.includes('mcp__lyriks') && !line.includes('mcp__unspa')) continue;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (!entry || entry.type !== 'assistant') continue;
		const content = entry.message && entry.message.content;
		if (!Array.isArray(content)) continue;
		for (const item of content) {
			if (!item || item.type !== 'tool_use' || typeof item.name !== 'string') continue;
			if (!item.name.startsWith('mcp__lyriks') && !item.name.startsWith('mcp__unspa')) continue;
			const args = item.input;
			const id = args && (args.project_id || args.projectId);
			if (typeof id === 'string' && id.trim()) project = id.trim();
		}
	}
	return project;
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
	const project =
		projectFromTranscript(typeof payload.transcript_path === 'string' ? payload.transcript_path : '') ||
		projectFromBindingBlock(cwd);
	const where = project ? ` (project ${project})` : '';
	const context =
		`Lyriks-bound repository${where}: this request goes through the Lyriks MCP without being asked. ` +
		'If it asks to MAKE a change to what the product does: spec first (apply_behavior_batch / patch_section / ' +
		'build_screen), then code, then index sync (sync_implementation_index), in this same turn. If it asks to ' +
		'QUALIFY a change (what it would involve, an estimate, an impact report, a dossier to prepare, a decision ' +
		'that belongs to someone else): Evolution (get_evolution / apply_evolution_batch), which plans and never ' +
		'writes the sections. If it could be either ("we should add X"): ask which in one sentence, never choose ' +
		'silently. If it asks how the product ' +
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
