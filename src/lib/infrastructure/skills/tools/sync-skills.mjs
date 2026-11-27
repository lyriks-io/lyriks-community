#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/sync-skills.mjs [--client claude|codex|gemini|copilot|generic] [--project <id>] [--json] [--url URL] [--token TOKEN]
// Installs the Lyriks playbooks, the binding block, the hooks and the helper
// scripts exactly as the server publishes them, without passing them through
// the conversation. Through tool answers alone an agent read about 464,000
// characters and retyped 288,000 more to install what this copies for nothing
// (criterion 3f42911b). It reports what the repository holds, writes what is
// new or stale, merges each block between its markers and nothing else, wires
// the hooks into the project settings once, and prints only what it did.
// sync_skills answers with the command to run (`selfInstall.command`): the
// endpoint, and a sign-in that lasts ten minutes and reads playbooks only.
// Needs mcp-client.mjs and skills-apply.mjs beside it and nothing else, so an
// install can start from those three files.
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINT_FLAGS, callToolJson, openSession, parseArgs, resolveEndpoint, runScript } from './mcp-client.mjs';
import { applyAnswer, applyGuide, newReport, readText } from './skills-apply.mjs';

const USAGE =
	'Usage: sync-skills.mjs [--client claude|codex|gemini|copilot|generic] [--project <id>] [--json] [--url URL] [--token TOKEN]';
const CLIENTS = ['claude', 'codex', 'gemini', 'copilot', 'generic'];
/** Where each runtime keeps its guides: Claude Code natively, every other one through a pointer. */
const SKILLS_DIR = { claude: '.claude/skills' };
const PORTABLE_SKILLS_DIR = '.agents/skills';
/** The binding files a client reports beside the scripts, so unchanged ones come back without content. */
const HOOK_PATHS = ['.claude/hooks/lyriks-bound-prompt.mjs', '.claude/hooks/lyriks-allow-tools.mjs', '.claude/hooks/lyriks-stop.mjs'];
const TOOLS_DIR = '.lyriks/tools';
const INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md'];
const BINDING_BLOCK = /<!-- lyriks-binding -->([\s\S]*?)<!-- \/lyriks-binding -->/;
/** Rounds before giving up: each one installs what fits one answer, and a sync never needs this many. */
const MAX_ROUNDS = 15;

/** The `contentHash:` a SKILL.md frontmatter carries, or undefined. */
export function guideHash(text) {
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	const line = front && /^contentHash:\s*(\S+)\s*$/m.exec(front[1]);
	return line ? line[1] : undefined;
}

/** The `// contentHash:` a script carries on its first line, or its second after a shebang. */
export function scriptHash(text) {
	const head = text.split('\n').slice(0, 2).join('\n');
	const line = /^\/\/ contentHash: (\S+)\s*$/m.exec(head);
	return line ? line[1] : undefined;
}

/** The guides the repository holds for this runtime, each with the hash its frontmatter carries. */
export function heldGuides(root, client) {
	const dir = join(root, SKILLS_DIR[client] ?? PORTABLE_SKILLS_DIR);
	if (!existsSync(dir)) return [];
	const held = [];
	for (const id of readdirSync(dir).sort()) {
		const text = readText(join(dir, id, 'SKILL.md'));
		if (text === null) continue;
		const contentHash = guideHash(text);
		held.push(contentHash ? { id, content_hash: contentHash } : { id });
	}
	return held;
}

/** The scripts and hooks the repository holds, each with the hash its header carries. */
export function heldTools(root) {
	const paths = [...HOOK_PATHS];
	const dir = join(root, TOOLS_DIR);
	if (existsSync(dir)) {
		for (const file of readdirSync(dir).sort()) if (file.endsWith('.mjs')) paths.push(`${TOOLS_DIR}/${file}`);
	}
	const held = [];
	for (const path of paths) {
		const text = readText(join(root, path));
		if (text === null) continue;
		const contentHash = scriptHash(text);
		held.push(contentHash ? { path, content_hash: contentHash } : { path });
	}
	return held;
}

/**
 * The project the binding block names, then the one `.unspa.json` names. A
 * sync without it would answer the generic block and replace the one that
 * names the project, so it is always passed when the repository says it.
 */
export function boundProject(root) {
	for (const file of INSTRUCTION_FILES) {
		const block = BINDING_BLOCK.exec(readText(join(root, file)) ?? '');
		const named = block && /Lyriks project `([^`]+)`/.exec(block[1]);
		if (named) return named[1].trim();
	}
	try {
		const index = JSON.parse(readText(join(root, '.unspa.json')) ?? 'null');
		if (index && typeof index.projectId === 'string' && index.projectId.trim()) return index.projectId.trim();
	} catch {
		// An index that is not JSON names no project here; the index scripts report it.
	}
	return undefined;
}

/**
 * Sync until nothing is left: every answer installs what fits it, and a guide
 * that did not fit is fetched alone with get_skill at once (every published
 * guide fits one answer on its own). Deferred scripts come with the next
 * answer, which reports what is now held.
 */
export async function syncAll(session, { root, client, project }) {
	const report = newReport();
	for (let round = 0; round < MAX_ROUNDS; round += 1) {
		// Each round counts again what is current: only the last answer's tally stands.
		report.current = 0;
		const args = { client, installed: heldGuides(root, client), installed_tools: heldTools(root), ...(project ? { project_id: project } : {}) };
		const answer = await callToolJson(session, 'sync_skills', args);
		report.calls += 1;
		const delivered = applyAnswer(root, report, answer, client);
		const deferredGuides = Array.isArray(answer.deferredForSize) ? answer.deferredForSize : [];
		const deferredScripts = Array.isArray(answer.deferredScripts) ? answer.deferredScripts : [];
		for (const id of deferredGuides) {
			const guide = await callToolJson(session, 'get_skill', { skill_id: id, client });
			report.calls += 1;
			if (typeof guide.installContent !== 'string') throw new Error(`get_skill ${id} answered without its content.`);
			applyGuide(root, report, { ...guide, id }, client);
		}
		if (deferredScripts.length === 0) return report;
		if (delivered === 0 && deferredGuides.length === 0) {
			throw new Error(`The server deferred ${deferredScripts.length} script(s) and delivered nothing: ${deferredScripts.join(', ')}.`);
		}
	}
	throw new Error(`Still deferred after ${MAX_ROUNDS} answers; run this again, it resumes from what is installed.`);
}

function printReport(report, json) {
	if (json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}
	for (const path of report.written) console.log(`wrote ${path}`);
	for (const path of report.merged) console.log(`merged the Lyriks block into ${path}`);
	for (const line of report.wired) console.log(`wired ${line}`);
	for (const warning of report.warnings) console.log(`warning: ${warning}`);
	const changed = report.written.length + report.merged.length + report.wired.length;
	console.log(
		changed === 0
			? `Everything is current (${report.current} file(s) checked, ${report.calls} call(s)).`
			: `${report.written.length} file(s) written, ${report.merged.length} block(s) merged, ${report.wired.length} hook(s) wired, ${report.current} already current, in ${report.calls} call(s).`
	);
}

/** Run as a command, not imported (the tests import the pure parts). */
function isMain() {
	if (!process.argv[1]) return false;
	try {
		return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
}

if (isMain()) {
	runScript(async () => {
		const { positional, flags } = parseArgs(process.argv.slice(2), [...ENDPOINT_FLAGS, 'client', 'project']);
		if (positional.length > 0) throw new Error(USAGE);
		const client = flags.client ?? 'claude';
		if (!CLIENTS.includes(client)) throw new Error(`--client must be one of ${CLIENTS.join(', ')}. ${USAGE}`);
		const root = process.cwd();
		const project = typeof flags.project === 'string' && flags.project.trim() ? flags.project.trim() : boundProject(root);
		const session = await openSession(resolveEndpoint(flags));
		const report = await syncAll(session, { root, client, project });
		printReport(report, flags.json === true);
		return report.warnings.length > 0 ? 1 : 0;
	});
}
