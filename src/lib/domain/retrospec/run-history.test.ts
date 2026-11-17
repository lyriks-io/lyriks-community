import { describe, expect, it } from 'vitest';
import type { RetrospecDocument, RetrospecRun } from './document';
import { RUN_STATUS_LABEL, runCards, withSilence } from './run-history';

const ana = { id: 'ana@example.com', name: 'Ana Lopez' };
const run = (id: string, over: Partial<RetrospecRun> = {}): RetrospecRun => ({
	id,
	mode: 'repo',
	implicit: false,
	startedAt: '2026-10-01T09:00:00.000Z',
	startedBy: ana,
	baseline: {},
	launchedAt: null,
	analysisEndedAt: null,
	analysisEndedBy: null,
	reviewStartedAt: null,
	itemTotal: 0,
	publishedAt: null,
	publishedBy: null,
	baselineId: null,
	verdicts: {},
	...over
});
const doc = (...runs: RetrospecRun[]): RetrospecDocument => ({ version: 1, runs, comments: {} });

describe('the Reverse page lists the Reverse-Specifications of the product, newest first [criterion:2dbed801]', () => {
	const first = run('run-1', {
		launchedAt: '2026-10-01T09:05:00.000Z',
		reviewStartedAt: '2026-10-01T11:00:00.000Z',
		publishedAt: '2026-10-02T15:00:00.000Z',
		publishedBy: { id: 'bo@example.com', name: 'Bo' }
	});

	it('reads each run with its source, its status and who validated it', () => {
		const second = run('run-2', { startedAt: '2026-10-20T08:00:00.000Z', mode: 'docs', launchedAt: '2026-10-20T08:01:00.000Z' });
		const cards = runCards(doc(first, second), 'running');
		expect(cards.map((c) => [c.id, c.status, c.mode, c.current])).toEqual([
			['run-2', 'running', 'docs', true],
			['run-1', 'validated', 'repo', false]
		]);
		expect(cards[1].validatedBy).toBe('Bo');
		expect(RUN_STATUS_LABEL[cards[0].status]).toBe('Running');
	});

	it('tells its history as recorded, in order, with who did what', () => {
		const ended = run('run-1', { launchedAt: '2026-10-01T09:05:00.000Z', analysisEndedAt: '2026-10-01T10:00:00.000Z', analysisEndedBy: ana });
		expect(runCards(doc(ended), 'bilan')[0].history).toEqual([
			{ label: 'Reverse-Specification started', at: '2026-10-01T09:00:00.000Z', by: 'Ana Lopez' },
			{ label: 'Prompt handed to the AI', at: '2026-10-01T09:05:00.000Z', by: null },
			{ label: 'Analysis closed', at: '2026-10-01T10:00:00.000Z', by: 'Ana Lopez' }
		]);
		expect(runCards(doc(first), 'done')[0].history.map((s) => s.label)).toEqual([
			'Reverse-Specification started',
			'Prompt handed to the AI',
			'Review started',
			'Specification validated'
		]);
	});

	it('reads a run not handed to the AI yet as not launched, and the stages of one under way', () => {
		expect(runCards(doc(run('run-1')), 'source')[0].status).toBe('not_launched');
		expect(runCards(doc(run('run-1', { launchedAt: '2026-10-01T09:05:00.000Z' })), 'bilan')[0].status).toBe('ready');
		expect(runCards(doc(run('run-1', { reviewStartedAt: '2026-10-01T09:05:00.000Z' })), 'review')[0].status).toBe('review');
		expect(runCards(doc(), 'start')).toEqual([]);
	});

	it('reads a run closed when the next one started as closed, with who relaunched', () => {
		const closed = run('run-1', { reviewStartedAt: '2026-10-01T11:00:00.000Z', closedAt: '2026-10-05T08:00:00.000Z', closedBy: ana });
		const cards = runCards(doc(closed, run('run-2', { startedAt: '2026-10-05T08:00:00.000Z' })), 'source');
		expect(cards.map((c) => [c.id, c.status])).toEqual([
			['run-2', 'not_launched'],
			['run-1', 'closed']
		]);
		expect(RUN_STATUS_LABEL[cards[1].status]).toBe('Closed');
		expect(cards[1].history.at(-1)).toEqual({ label: 'Closed when the next run started', at: '2026-10-05T08:00:00.000Z', by: 'Ana Lopez' });
	});
});

describe('the run under way reads paused in the history while its LLM is silent [criterion:7a4a99e4]', () => {
	const done = run('run-1', { launchedAt: '2026-10-01T09:05:00.000Z', reviewStartedAt: '2026-10-01T11:00:00.000Z', publishedAt: '2026-10-02T15:00:00.000Z' });
	const now = run('run-2', { startedAt: '2026-10-20T08:00:00.000Z', launchedAt: '2026-10-20T08:01:00.000Z' });

	it('reads Paused instead of Running, and leaves the other runs as they stand', () => {
		const cards = withSilence(runCards(doc(done, now), 'running'), true);
		expect(cards.map((c) => c.status)).toEqual(['paused', 'validated']);
		expect(RUN_STATUS_LABEL.paused).toBe('Paused');
	});

	it('reads Running while its LLM calls, and never pauses a run that is not reading', () => {
		expect(withSilence(runCards(doc(done, now), 'running'), false)[0].status).toBe('running');
		expect(withSilence(runCards(doc(done, now), 'bilan'), true)[0].status).toBe('ready');
	});
});
