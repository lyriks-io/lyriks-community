import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunCard } from '$domain/retrospec/run-history';
import RetroHistory from './RetroHistory.svelte';
import RetroSummary from './RetroSummary.svelte';

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
const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

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

	it('is shown under the live analysis and the summary, with the line saying what the page does', () => {
		const page = src('../../../routes/projects/[projectId]/retrospec/+page.svelte');
		expect(page).toContain('<RetroHistory runs={history} />');
		expect(page).toContain('{lead}</p>');
		expect(page).toContain('withSilence(data.runs');
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

	it('asks first with the words of the next run, then shows its source step', () => {
		const page = src('../../../routes/projects/[projectId]/retrospec/+page.svelte');
		expect(page).toContain("relaunchQuestion(data.next, status !== 'done')");
		expect(page).toContain("moveRun('source', [{ op: 'start', mode: 'repo' }]");
		expect(page).toContain('relaunchOffered(data.canWrite, status)');
	});
});

describe('every way to the runs opens the Reverse page, and the drawer over the Overview is gone [criterion:2dbed801] [criterion:9359cb3c] [criterion:8e942b12] [criterion:a0959413]', () => {
	it('links the navigation, the version line of Knowledge and Home to the Reverse page', () => {
		expect(src('../shell/SideProjectNav.svelte')).not.toContain('?retro');
		expect(src('../spec360/KnowledgeBar.svelte')).toContain('href="{base}/retrospec"');
		expect(src('../../server/home.server.ts')).not.toContain('?retro');
	});

	it('has no drawer of runs, and an older link to it lands on the Reverse page', () => {
		expect(existsSync(fileURLToPath(new URL('../spec360/overview/RetroDrawer.svelte', import.meta.url)))).toBe(false);
		expect(src('../../../routes/projects/[projectId]/spec/+page.svelte')).not.toContain('RetroDrawer');
		expect(src('../../../routes/projects/[projectId]/spec/+page.server.ts')).toContain("if (url.searchParams.has('retro')) redirect(303, `/projects/${encodeURIComponent(params.projectId)}/retrospec`);");
	});
});
