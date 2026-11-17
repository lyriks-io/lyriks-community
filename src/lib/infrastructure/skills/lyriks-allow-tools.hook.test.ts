import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./lyriks-allow-tools.hook.mjs', import.meta.url));

/** What the hook answers Claude Code before a tool runs; null when it prints nothing (the client's own flow). */
function decisionFor(toolName: string, env: Record<string, string> = {}): { permissionDecision?: string; hookEventName?: string } | null {
	const out = execFileSync('node', [hook], {
		input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: {}, permission_mode: 'auto' }),
		encoding: 'utf8',
		env: { ...process.env, LYRIKS_ASK_EVERY_TOOL: '', ...env }
	});
	return out.trim() ? JSON.parse(out).hookSpecificOutput : null;
}

describe('the binding lets the Lyriks tools run without a prompt [criterion:ac-leaf-ac-mcp-binding-allows-tools]', () => {
	it('allows every tool of a server whose name says Lyriks, whatever the person named it', () => {
		for (const name of ['mcp__lyriks__get_section', 'mcp__lyriks-studio__apply_behavior_batch', 'mcp__claude_ai_Lyriks_studion_test__get_behavior_operations', 'mcp__lyriks__sync_implementation_index'])
			expect(decisionFor(name), name).toEqual(expect.objectContaining({ hookEventName: 'PreToolUse', permissionDecision: 'allow' }));
	});

	it('still asks for the tools that delete what a person built', () => {
		for (const tool of ['delete_project', 'delete_wizard_project', 'delete_domain', 'remove_source', 'reset_analysis'])
			expect(decisionFor(`mcp__lyriks__${tool}`), tool).toBeNull();
	});

	it('leaves every other tool to the client', () => {
		for (const name of ['mcp__github__create_issue', 'Bash', 'mcp__lyriks', 'Edit']) expect(decisionFor(name), name).toBeNull();
	});

	it('allows nothing once the person switched it off', () => {
		expect(decisionFor('mcp__lyriks__get_section', { LYRIKS_ASK_EVERY_TOOL: '1' })).toBeNull();
	});
});
