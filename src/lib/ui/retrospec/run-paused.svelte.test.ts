import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { CONNECTED_MS } from '$domain/retrospec';
import LiveProcessChip from '$ui/shell/LiveProcessChip.svelte';
import RetroRunning from './RetroRunning.svelte';

/** A retrospecification whose LLM went silent never reads as running (feat-ai-session). */

const lastCall = '2026-11-03T08:15:00.000Z';
const t = Date.parse(lastCall);
const process = { label: 'Live Reverse-Specification · 33 %', href: '/projects/gameeee-4660a1/retrospec', llm: { seenAt: lastCall, pausedLabel: 'Reverse-Specification paused · 33 %' } };

const board = (now: number) =>
	render(RetroRunning, {
		props: {
			productName: 'Floppy Bird',
			reading: 'Lyriks is reading the code of Floppy Bird',
			scope: 'The whole product, read for the first time.',
			phases: [{ key: 'features', label: 'Reading the code', share: 0.5, state: 'current' as const, note: '22 sources', parts: [] }],
			pct: 33,
			started: true,
			finished: false,
			found: [{ n: 22, label: 'Sources read' }],
			log: [],
			aiSeenAt: lastCall,
			now,
			relaunchPrompt: 'With the Lyriks MCP, reconnect to the project gameeee-4660a1',
			canWrite: true,
			onEnd: () => {},
			onSummary: () => {}
		}
	}).body;

afterEach(() => {
	vi.useRealTimers();
});

describe('a retrospecification whose LLM went silent reads paused, never running [criterion:7a4a99e4]', () => {
	it('the navigation reads paused with still bars once the LLM went silent', () => {
		vi.useFakeTimers();
		vi.setSystemTime(t + CONNECTED_MS + 60_000);
		const body = render(LiveProcessChip, { props: { process } }).body;
		expect(body).toContain('Reverse-Specification paused · 33 %');
		expect(body).toContain('No call from your LLM');
		expect(body).not.toContain('Live Reverse-Specification');
		expect(body).toContain('eq still');
		expect(body).not.toContain('eq live');
	});

	it('the navigation reads live with its moving bars while the LLM calls', () => {
		vi.useFakeTimers();
		vi.setSystemTime(t + 10_000);
		const body = render(LiveProcessChip, { props: { process } }).body;
		expect(body).toContain('Live Reverse-Specification · 33 %');
		expect(body).toContain('eq live');
	});

	it('a process no LLM carries reads as the server named it', () => {
		const body = render(LiveProcessChip, { props: { process: { label: 'Live Reverse-Specification · 33 %', href: '/x' } } }).body;
		expect(body).toContain('Live Reverse-Specification · 33 %');
	});

	it('the live analysis stops every spinner and says it is paused, above the prompt that resumes it', () => {
		const body = board(t + CONNECTED_MS + 60_000);
		expect(body).toContain('The analysis of Floppy Bird is paused');
		expect(body).toContain('aria-label="Paused"');
		expect(body).toContain('No call from your LLM');
		expect(body).not.toContain('Lyriks is reading the code');
		expect(body).not.toContain('lk-spin');
	});

	it('the live analysis spins while the LLM calls', () => {
		const body = board(t + 10_000);
		expect(body).toContain('Lyriks is reading the code of Floppy Bird');
		expect(body).toContain('lk-spin');
		expect(body).not.toContain('No call from your LLM');
	});
});
