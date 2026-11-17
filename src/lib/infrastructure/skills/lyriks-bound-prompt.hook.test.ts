import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./lyriks-bound-prompt.hook.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const call = (id: string, name: string, input: Record<string, unknown>) =>
	JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__lyriks__${name}`, input }] } });
const result = (id: string, text: string, isError = false) =>
	JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } });
const touched = call('t0', 'get_section', { project_id: 'kutt-c76982', section: 'features' });

/** What the hook adds to a prompt, given the conversation so far; '' when it prints nothing. */
function contextFor(lines: string[], options: { prompt?: string; env?: Record<string, string> } = {}): string {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-hook-session-'));
	dirs.push(dir);
	const transcript = join(dir, 'session.jsonl');
	writeFileSync(transcript, lines.join('\n'));
	const out = execFileSync('node', [hook], {
		input: JSON.stringify({ cwd: dir, prompt: options.prompt ?? 'add a nitro boost', transcript_path: transcript }),
		encoding: 'utf8',
		env: { ...process.env, LYRIKS_NO_AUTO_SESSION: '', ...options.env }
	});
	return out ? (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext : '';
}
const OPEN_IT = 'No live session of yours is open on kutt-c76982';

describe('the binding hook says when to open the session of the project [criterion:ac-leaf-ac-ai-session-auto-open]', () => {
	it('asks to open it in the background at the latest with a link to the app, never for using the MCP alone', () => {
		const context = contextFor([touched]);
		expect(context).toContain(OPEN_IT);
		expect(context).toContain('Do not open one merely because you use the Lyriks MCP');
		expect(context).toContain('at the latest in the turn you hand the person a link to the app');
		expect(context).toContain('before that link');
		expect(context).not.toContain('open it now');
		expect(context).toContain('start_evolution_session with project_id kutt-c76982 alone');
		expect(context).toContain('node .lyriks/tools/await-event.mjs kutt-c76982 - <session_id>');
		expect(context).toContain('wait.command');
		expect(context).not.toContain('LYRIKS_MCP_URL');
		expect(context).toContain('run_in_background');
		expect(context).toContain('spec first');
	});

	it('says nothing about it while the session is open', () => {
		const context = contextFor([touched, call('s1', 'start_evolution_session', { project_id: 'kutt-c76982' }), result('s1', '{"ok":true,"session":{"id":"abc"}}')]);
		expect(context).not.toContain('live session');
		expect(context).toContain('spec first');
	});

	it('asks again once the session went idle, as the background waiter printed it', () => {
		const ended = JSON.stringify({ type: 'user', message: { content: 'Background command finished:\n{\n  "kind": "ended",\n  "reason": "idle"\n}' } });
		expect(contextFor([touched, call('s1', 'start_evolution_session', { project_id: 'kutt-c76982' }), result('s1', '{"ok":true}'), ended])).toContain(OPEN_IT);
		const awaited = [call('w1', 'await_evolution_event', { project_id: 'kutt-c76982', session_id: 'abc' }), result('w1', '{"kind":"ended","reason":"gone"}')];
		expect(contextFor([touched, call('s1', 'start_evolution_session', { project_id: 'kutt-c76982' }), ...awaited])).toContain(OPEN_IT);
	});

	it('asks again when opening it failed', () => {
		expect(contextFor([touched, call('s1', 'start_evolution_session', { project_id: 'kutt-c76982' }), result('s1', 'fetch failed', true)])).toContain(OPEN_IT);
	});

	it('never once the person ended it, nor when the person switched it off', () => {
		const endedByPerson = [touched, call('s1', 'start_evolution_session', { project_id: 'kutt-c76982' }), call('e1', 'update_evolution_session', { project_id: 'kutt-c76982', session_id: 'abc', end: true })];
		expect(contextFor(endedByPerson)).not.toContain('live session');
		expect(contextFor([touched], { env: { LYRIKS_NO_AUTO_SESSION: '1' } })).not.toContain('live session');
	});

	it('stays silent on a harness event', () => {
		expect(contextFor([touched], { prompt: '<task-notification>\n<task-id>abc</task-id>' })).toBe('');
	});
});

describe('the binding hook leaves the code to the code tools [criterion:4cfd9e34]', () => {
	it('claims for Lyriks what the product does, sends the agent on into the code, and leaves a code-only question to the code tools', () => {
		const context = contextFor([touched], { env: { LYRIKS_NO_AUTO_SESSION: '1' } });
		expect(context).toContain('a request about what this product does goes through the Lyriks MCP');
		expect(context).not.toContain('this request goes through the Lyriks MCP');
		expect(context).toContain('then follow the places in the code it gives into your own code tools');
		expect(context).toContain('tell the person where the code does otherwise');
		expect(context).toContain('A question about the code alone');
		expect(context).toContain('without a Lyriks call');
	});
});
