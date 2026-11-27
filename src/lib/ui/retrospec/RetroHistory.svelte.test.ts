import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { RunCard } from '$domain/retrospec/run-history';
import RetroHistory from './RetroHistory.svelte';
import RetroSummary from './RetroSummary.svelte';
import { load as overviewLoad } from '../../../routes/projects/[projectId]/spec/+page.server';

/** The Reverse page is the one place of the product's runs (feat-ai-session, design v3). */

const card = (id: string, over: Partial<RunCard> = {}): RunCard => ({
	id,
	startedAt: '2026-11-05T20:33:00.000Z',
	mode: 'repo',
	status: 'validated',
	startedBy: 'Ana Lopez',
	validatedBy: 'Bo',
	current: false,
	commit: '7c0d4b1',
	complementary: false,
	whole: false,
	history: [{ label: 'Reverse-Specification started', at: '2026-11-05T20:33:00.000Z', by: 'Ana Lopez' }],
	...over
});

describe('the history of the Reverse page lists every run as a table [criterion:2dbed801]', () => {
	it('reads Date, Source, Commit and Result, newest first, each row folded', () => {
		const body = render(RetroHistory, {
			props: { runs: [card('run-2', { current: true, status: 'running', complementary: true, commit: null, validatedBy: null }), card('run-1')] }
		}).body;
		expect(body).toContain('>History</h2>');
		for (const head of ['Date', 'Source', 'Commit', 'Result']) expect(body).toContain(`>${head}</th>`);
		expect(body).toContain('From the code · Complementary');
		expect(body).toContain('7c0d4b1');
		expect(body.indexOf('Running')).toBeLessThan(body.indexOf('Validated'));
		expect(body).toContain('aria-expanded="false"');
		expect(body).not.toContain('Started by Ana Lopez.');
	});

	it('reads Paused for a silent run, and Rebuilt by Lyriks for a run nobody started from the page [criterion:7a4a99e4] [criterion:029a8736]', () => {
		const body = render(RetroHistory, { props: { runs: [card('run-unstarted', { startedAt: '', status: 'paused', mode: 'docs', commit: null, history: [] })] } }).body;
		expect(body).toContain('Paused');
		expect(body).toContain('Rebuilt by Lyriks');
		expect(body).toContain('From the documentation');
	});

	it('shows nothing while the product has no run', () => {
		expect(render(RetroHistory, { props: { runs: [] } }).body).not.toContain('History');
	});
});

describe('Relaunch the analysis sits beside the way to Knowledge once the analysis is over [criterion:2dbed801] [unspa:8c76cb65:e296dd4f]', () => {
	const summary = (onRelaunch: (() => void) | null, validated = true) =>
		render(RetroSummary, { props: { findings: [], validated, onFinding: () => {}, onOpenSpec: () => {}, onRelaunch } }).body;

	it('offers it beside Open Knowledge when a run may start', () => {
		const body = summary(() => {});
		expect(body).toContain('Relaunch the analysis');
		expect(body.indexOf('Relaunch the analysis')).toBeLessThan(body.indexOf('Open Knowledge'));
	});

	it('offers it beside Validate in Knowledge on a run not validated yet', () => {
		const body = summary(() => {}, false);
		expect(body.indexOf('Relaunch the analysis')).toBeLessThan(body.indexOf('Validate in Knowledge'));
	});

	it('offers nothing when none may start', () => {
		expect(summary(null)).not.toContain('Relaunch the analysis');
	});
});

describe('the drawer of runs over the Overview is gone: an older link to it lands on the Reverse page [criterion:2dbed801]', () => {
	it('sends `?retro` on the Overview to the Reverse page', async () => {
		const event = { params: { projectId: 'p 1' }, url: new URL('https://x.test/projects/p%201/spec?retro'), depends: () => {}, locals: {} };
		await expect(overviewLoad(event as never)).rejects.toMatchObject({ status: 303, location: '/projects/p%201/retrospec' });
	});
});

describe('An approved scope reads in the History [criterion:bccbfdb5]', () => {
	const scope = (state: 'none' | 'current' | 'changed') => ({
		covers: 'The Lyriks application.',
		coveredCount: 109,
		fullProduct: false,
		leftOutCount: 62,
		leftOut: [],
		decision: '',
		decidedAt: null,
		approval: { state, by: state === 'none' ? '' : 'Ann Lee', at: state === 'none' ? '' : '2026-11-25T21:00:00.000Z' },
		shown: 'fnv1a-1'
	});
	const rows = (body: string) => [...body.matchAll(/<tr class="hover:bg-evo-hover"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);

	it('takes its row among the runs at the day of the approval, Source Scope, Result Approved', () => {
		const body = render(RetroHistory, {
			props: { runs: [card('run-2', { startedAt: '2026-11-26T08:00:00.000Z' }), card('run-1', { startedAt: '2026-11-12T08:00:00.000Z' })], scope: scope('current') }
		}).body;
		const [first, second, third] = rows(body);
		expect(first).not.toContain('Scope');
		expect(second).toContain('>Scope</td>');
		expect(second).toContain('25 Nov 2026');
		expect(second).toContain('>Approved</span>');
		expect(second).toContain('aria-haspopup="dialog"');
		expect(third).toContain('12 Nov 2026');
	});

	it('reads Changed since once the list moved, and alone when no run exists', () => {
		const body = render(RetroHistory, { props: { runs: [], scope: scope('changed') } }).body;
		expect(body).toContain('>History</h2>');
		expect(rows(body)).toHaveLength(1);
		expect(body).toContain('>Changed since</span>');
	});

	it('has no row while nobody approved it', () => {
		expect(render(RetroHistory, { props: { runs: [], scope: scope('none') } }).body).not.toContain('History');
		expect(render(RetroHistory, { props: { runs: [card('run-1')], scope: scope('none') } }).body).not.toContain('>Scope</td>');
	});
});
