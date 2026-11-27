import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./lyriks-stop.hook.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const prompt = (text: string) => JSON.stringify({ type: 'user', message: { content: text } });
const call = (id: string, name: string, input: Record<string, unknown>) =>
	JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__lyriks-lab__${name}`, input }] } });
const bash = (id: string, command: string) =>
	JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command, run_in_background: true } }] } });
const result = (id: string, text: string, isError = false) =>
	JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } });
const says = (text: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

const P = 'kutt-c76982';
const RUN = [prompt('Run the Reverse-Specification'), call('r1', 'report_retrospec_reading', { project_id: P, received: true }), result('r1', '{"ok":true}')];
const ASKED = call('t1', 'update_evolution_session', { project_id: P, session_id: 's1', ask: 'Which billing flow runs in production?' });
const WAIT = bash('w1', `node .lyriks/tools/await-event.mjs ${P} - s1 --url https://lyriks.example.com/mcp`);

/** The reason the hook holds the turn with, or '' when it lets it end. */
function heldWith(lines: string[], options: { active?: boolean; env?: Record<string, string> } = {}): string {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-stop-hook-'));
	dirs.push(dir);
	const transcript = join(dir, 'session.jsonl');
	writeFileSync(transcript, lines.join('\n'));
	const out = execFileSync('node', [hook], {
		input: JSON.stringify({ cwd: dir, hook_event_name: 'Stop', stop_hook_active: options.active ?? false, transcript_path: transcript }),
		encoding: 'utf8',
		env: { ...process.env, LYRIKS_NO_STOP_HOOK: '', ...options.env }
	});
	if (!out) return '';
	const answer = JSON.parse(out) as { decision: string; reason: string };
	expect(answer.decision).toBe('block');
	return answer.reason;
}

describe('the binding makes the AI say why it stops on the person\'s pages [criterion:7b37377d]', () => {
	it('holds a run that ends on a question in the chat, and says how to ask it on the pages', () => {
		const reason = heldWith([...RUN, says('I read the billing code.\n\nWhich of the two flows is the one in production?')]);
		expect(reason).toContain('update_evolution_session with ask');
		expect(reason).toContain('stopped');
		expect(reason).toContain(`start_evolution_session with project_id ${P} alone`);
		expect(reason).toContain('wait.command in the background');
	});

	it('holds a run that stops without a word and without waiting for the person', () => {
		expect(heldWith([...RUN, says('Features 1 to 12 are read.')])).not.toBe('');
	});

	it('lets a turn end that asked its question on the pages', () => {
		expect(heldWith([...RUN, ASKED, result('t1', '{"ok":true}'), WAIT, says('Your question waits in Ask my AI: which flow is in production?')])).toBe('');
	});

	it('does not count a question Lyriks refused', () => {
		expect(heldWith([...RUN, ASKED, result('t1', 'No session is open on this project', true), says('Which flow is in production?')])).not.toBe('');
	});

	it('lets an answered click end while it waits again in the background', () => {
		const session = [prompt('Background command finished: {"kind":"click"}'), call('a1', 'apply_evolution_batch', { project_id: P, operations: [] }), result('a1', '{"ok":true}'), WAIT, says('Answered on the page.')];
		expect(heldWith([call('s0', 'start_evolution_session', { project_id: P }), result('s0', '{"ok":true}'), ...session])).toBe('');
	});

	it('holds work done after the question, without a new word on the pages', () => {
		const later = [call('r2', 'report_retrospec_reading', { project_id: P, phase: 'features' }), result('r2', '{"ok":true}'), says('Done for now.')];
		expect(heldWith([...RUN, ASKED, result('t1', '{"ok":true}'), ...later])).not.toBe('');
	});

	it('never holds a turn twice', () => {
		expect(heldWith([...RUN, says('Which flow is in production?')], { active: true })).toBe('');
	});

	it('lets a turn nobody follows on the pages end', () => {
		expect(heldWith([prompt('What does the feature do?'), call('g1', 'get_behavior_feature', { project_id: P, feature_id: 'f' }), result('g1', '{}'), says('Shall I change it?')])).toBe('');
	});

	it('is switched off by LYRIKS_NO_STOP_HOOK', () => {
		expect(heldWith([...RUN, says('Which flow is in production?')], { env: { LYRIKS_NO_STOP_HOOK: '1' } })).toBe('');
	});

	it('reads only the turn the latest prompt started', () => {
		const earlier = [...RUN, says('Which flow is in production?')];
		expect(heldWith([...earlier, prompt('Thanks, that is all.'), says('Glad to help.')])).toBe('');
	});

	it('ignores a question mark inside code or an address', () => {
		expect(heldWith([prompt('hi'), call('s0', 'start_evolution_session', { project_id: P }), result('s0', '{}'), WAIT, says('Open https://lyriks.example.com/projects/p/ask?c=1 and run `a ? b : c`.')])).toBe('');
	});
});
