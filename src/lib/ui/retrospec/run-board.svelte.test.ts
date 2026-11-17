import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { CONNECTED_MS } from '$domain/retrospec';
import RetroRunning from './RetroRunning.svelte';
import RetroSteps from './RetroSteps.svelte';

/** The live analysis of a Reverse-Specification and its steps (feat-ai-session). */

const lastCall = '2026-11-05T20:44:00.000Z';
const t = Date.parse(lastCall);
const PROMPT = 'With the Lyriks MCP, reconnect to the project vlc-964631 and resume the Reverse-Specification of VLC';

const board = (now: number, over: Partial<{ canWrite: boolean; finished: boolean; phases: unknown[]; summary: unknown; later: boolean; scope: string }> = {}) =>
	render(RetroRunning, {
		props: {
			productName: 'VLC',
			reading: 'Lyriks is reading the code of VLC',
			scope: over.scope ?? 'The whole product, read for the first time.',
			later: over.later ?? false,
			phases: (over.phases as never) ?? [
				{ key: 'reading', label: 'Reading the code', share: 0.2, state: 'done' as const, note: '4 sources', parts: [] },
				{ key: 'features', label: 'Features, actions and rules', share: 0.4, state: 'current' as const, note: '37 features', parts: [] }
			],
			pct: 12,
			started: true,
			finished: over.finished ?? false,
			found: [{ n: 4, label: 'Sources read' }],
			log: [],
			aiSeenAt: lastCall,
			now,
			relaunchPrompt: PROMPT,
			canWrite: over.canWrite ?? true,
			summary: (over.summary as never) ?? null,
			onEnd: () => {},
			onSummary: () => {}
		}
	}).body;

afterEach(() => {
	vi.useRealTimers();
});

describe('a silent LLM is told by a red alert on the live analysis [criterion:348770f8]', () => {
	it('reads as an alert, red edge and red ground, with one sentence and one copy button, the prompt never written out', () => {
		vi.useFakeTimers();
		vi.setSystemTime(t + CONNECTED_MS + 60_000);
		const body = board(t + CONNECTED_MS + 60_000);
		const alert = body.slice(body.indexOf('data-silent-alert'), body.indexOf('</div>', body.indexOf('data-silent-alert')));
		expect(body).toContain('role="alert"');
		expect(alert).toContain('border-red');
		expect(alert).toContain('bg-red-tint');
		expect(alert).toContain('px-5 py-5');
		expect(alert).toContain('No call from your LLM');
		expect(alert).toContain('Look in its window first: it may be asking you to allow a Lyriks tool. If it stopped, copy the prompt and paste it in your LLM session: it resumes where it stopped, without rewriting what is written.');
		expect(alert).toContain('Copy the prompt');
		expect(body).not.toContain(PROMPT);
		expect(body).not.toContain('border-orange bg-orange-tint');
	});

	it('is gone while the LLM calls', () => {
		const body = board(t + 10_000);
		expect(body).not.toContain('role="alert"');
		expect(body).not.toContain('No call from your LLM');
	});
});

describe('closing the analysis by hand is a quiet link under the phases [criterion:0427b908]', () => {
	it('sits under the list of phases as a small grey link, nothing between the title and the progress', () => {
		const body = board(t + 10_000);
		const link = body.indexOf('data-end-analysis');
		expect(link).toBeGreaterThan(body.indexOf('Features, actions and rules'));
		expect(link).toBeGreaterThan(body.indexOf('aria-label="Analysis progress"'));
		const tag = body.slice(body.lastIndexOf('<button', link), body.indexOf('</button>', link));
		expect(tag).toContain('text-xs text-ink-3 underline');
		expect(tag).not.toContain('uppercase');
		expect(tag).toContain('Your LLM ends the analysis with its final check.');
		expect(tag).toContain('Mark the analysis as finished');
	});

	it('is offered only to who may edit, and only while the analysis runs', () => {
		expect(board(t + 10_000, { canWrite: false })).not.toContain('Mark the analysis as finished');
		expect(board(t + 10_000, { finished: true })).not.toContain('Mark the analysis as finished');
	});
});

describe('a step or a phase done is ticked with a whole check [criterion:642d3667]', () => {
	it('draws the check of the Source step done, never a typed character', () => {
		const steps = render(RetroSteps, { props: { reached: 'analysis', current: 'analysis', finished: false, onGo: () => {} } }).body;
		expect(steps).toContain('data-check');
		expect(steps).toContain('bg-green');
		expect(steps).not.toContain('✓');
	});

	it('draws the check of a phase done on the live analysis, and of a finished analysis', () => {
		const running = board(t + 10_000);
		expect(running).toContain('data-check');
		expect(running).not.toContain('✓');
		expect(board(t + 10_000, { finished: true })).not.toContain('✓');
	});
});

describe('the summary of a Reverse-Specification says whether Lyriks read the whole product [criterion:a05bca06]', () => {
	const partial = { whole: false as const, pct: 23, title: 'Lyriks read 23 % of the code of VLC', line: 'The review started at 23 %, before Lyriks ran its final check.' };
	const summary = (reading: unknown) => ({ code: null, traced: 0, reading });

	it('never claims the reading whole before the final check: no green check, the share read, and why it stopped', () => {
		const body = board(t + 10_000, { finished: true, summary: summary(partial) });
		expect(body).toContain('Lyriks read 23 % of the code of VLC');
		expect(body).toContain('The review started at 23 %, before Lyriks ran its final check.');
		expect(body).toContain('data-partial-reading');
		expect(body).not.toContain('Lyriks has read');
		expect(body).not.toContain('justify-center bg-green text-ink');
	});

	it('stops every spinner once the run is over, the phase it stopped on kept', () => {
		const body = board(t + 10_000, { finished: true, summary: summary(partial) });
		expect(body).toContain('Features, actions and rules');
		expect(body).not.toContain('aria-label="In progress"');
		expect(board(t + 10_000)).toContain('aria-label="In progress"');
	});

	it('reads whole, under a green check, once Lyriks ran its final check', () => {
		const body = board(t + 10_000, { finished: true, summary: summary({ whole: true, title: 'Lyriks has read the code of VLC' }) });
		expect(body).toContain('Lyriks has read the code of VLC');
		expect(body).not.toContain('data-partial-reading');
		expect(body).toContain('justify-center bg-green text-ink');
	});
});

describe('the Reverse page says what each run reads, while it reads and once it is over [criterion:25254e5a]', () => {
	const SCOPE = 'What changed in the code since commit abc1234. The rest of the specification is not read again.';

	it('keeps the Scope line under the title while the LLM reads, and on the summary', () => {
		const running = board(t + 10_000, { scope: SCOPE });
		expect(running).toContain('data-run-scope');
		expect(running).toContain(SCOPE);
		expect(running.indexOf('Lyriks is reading the code of VLC')).toBeLessThan(running.indexOf('data-run-scope'));
		const over = board(t + 10_000, { scope: SCOPE, finished: true, summary: { code: null, traced: 0, reading: { whole: true, title: 'Lyriks has read what changed in the code of VLC' } } });
		expect(over).toContain(SCOPE);
	});

	it('keeps the Scope line while the LLM is silent', () => {
		vi.useFakeTimers();
		vi.setSystemTime(t + CONNECTED_MS + 60_000);
		expect(board(t + CONNECTED_MS + 60_000, { scope: SCOPE })).toContain(SCOPE);
	});

	it('counts the whole specification on a later run, and what the run found on a first one', () => {
		expect(board(t + 10_000, { later: true })).toContain('In the specification');
		expect(board(t + 10_000, { later: true })).not.toContain('Found so far');
		expect(board(t + 10_000)).toContain('Found so far');
	});
});
