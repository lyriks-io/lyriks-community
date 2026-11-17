#!/usr/bin/env node
// Lyriks tools hook (Claude Code, PreToolUse). Installed into a repository by
// `sync_skills` with the binding, wired in .claude/settings.json for every MCP
// tool. A retrospecification calls the Lyriks tools hundreds of times, and a
// person asked to allow each call spent the run answering prompts
// (ac-mcp-binding-allows-tools). This hook allows, without a prompt, every tool
// of an MCP server whose name says Lyriks, whatever the person named it
// (mcp__lyriks__..., mcp__lyriks-studio__..., a claude.ai connector named
// Lyriks), except the tools that delete what a person built: those still ask.
// For any other tool it prints nothing, which leaves Claude Code's own flow,
// and it allows nothing when LYRIKS_ASK_EVERY_TOOL=1. No dependencies, no
// network, well under 100 ms.
import { readFileSync } from 'node:fs';

/** The tools that delete what a person built: still asked, one call at a time. */
const ASKED = new Set(['delete_project', 'delete_wizard_project', 'delete_domain', 'remove_source', 'reset_analysis']);

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

function readStdin() {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

function main() {
	if (process.env.LYRIKS_ASK_EVERY_TOOL === '1') return;
	let payload = {};
	try {
		payload = JSON.parse(readStdin() || '{}');
	} catch {
		return;
	}
	const call = mcpTool(payload.tool_name);
	if (!call || !isLyriksServer(call.server) || ASKED.has(call.tool)) return;
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'allow',
				permissionDecisionReason: 'A Lyriks tool, allowed by the Lyriks binding (LYRIKS_ASK_EVERY_TOOL=1 asks again).'
			}
		}) + '\n'
	);
}

main();
