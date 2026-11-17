import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type FindingDraft } from '$domain/evolution';
import type { Finding } from '$domain/retrospec';
import { ORIGIN_FILTERS, noticedGroups, noticedSummary, noticedTypeKey, noticedView, showsUnder } from './noticed';

const sheet = { kicker: 'PROBLEM SHEET', title: 't', sections: [] };
const kind = (label: string) => ({ label, meaning: `What ${label} means` });
const issue = (id: string, tone: 'major' | 'minor' = 'major', type = 'Ambiguity'): Finding => ({
	id: `issue:${id}`,
	tone,
	text: id,
	where: 'Feature',
	kind: kind(type),
	sheet,
	decision: { issueId: id, question: 'q' },
	gapIds: [`gap-rules-issue-ambiguity-${id}`]
});
const check = (id: string, gaps: string[]): Finding => ({ id: `check:${id}`, tone: 'major', unconfirmed: true, text: id, where: 'Final check', kind: kind('Final check'), sheet, gapIds: gaps });
const computed: Finding = { id: 'computed:orphan-tables', tone: 'minor', text: 'tables', where: 'Data', kind: kind('Table related to nothing'), sheet };
const line = (findingId: string): FindingDraft => ({ id: `finding:${findingId}`, findingId, title: findingId, featureRef: null, blocking: false, outcome: 'undecided', reason: '', sourceIds: [], materialisedAt: null });

describe('What Lyriks noticed counts what is left to review [criterion:14be32d5]', () => {
	it('counts every point, the settled ones apart, and the major and minor of what waits', () => {
		const request = createEvolutionRequest({ id: 'r-1', stage: 'specification', findingDrafts: [line('gap-rules-issue-ambiguity-b')] });
		const view = noticedView({ open: [issue('a'), issue('b'), issue('c', 'minor'), computed], kept: [issue('d')], requests: [request], projectId: 'p' });
		expect(view.points.map((p) => [p.finding.id, p.state])).toEqual([
			['issue:a', 'pending'],
			['issue:b', 'sent'],
			['issue:d', 'rejected'],
			['issue:c', 'pending'],
			['computed:orphan-tables', 'pending']
		]);
		expect([view.total, view.pending, view.settled, view.major, view.minor]).toEqual([5, 3, 2, 1, 2]);
	});
});

describe('a point is rejected or turned into an evolution, and either is taken back [criterion:e0f69b3c]', () => {
	it('offers Reject on an issue of the register only, New evolution on what Project health lists, neither on what is settled', () => {
		const view = noticedView({ open: [issue('a'), check('rule', ['g-1', 'g-2']), computed], kept: [issue('d')], requests: [], projectId: 'p' });
		expect(view.points.map((p) => [p.finding.id, p.canReject, p.canEvolve])).toEqual([
			['issue:a', true, true],
			['check:rule', false, true],
			['issue:d', false, false],
			['computed:orphan-tables', false, false]
		]);
	});

	it('never offers Reject on an issue that blocks the project health', () => {
		const blocking: Finding = { ...issue('a'), blocking: true };
		expect(noticedView({ open: [blocking], kept: [], requests: [], projectId: 'p' }).points.map((p) => [p.canReject, p.canEvolve])).toEqual([[false, true]]);
	});

	it('names the request that settles a point, and whether Undo cancels it or takes the point off it', () => {
		const solo = createEvolutionRequest({ id: 'r-1', stage: 'specification', findingDrafts: [line('g-1'), line('g-2')] });
		const shared = createEvolutionRequest({ id: 'r-2', stage: 'specification', findingDrafts: [line('gap-rules-issue-ambiguity-a'), line('g-9')] });
		const view = noticedView({ open: [issue('a'), check('rule', ['g-1', 'g-2'])], kept: [], requests: [solo, shared], projectId: 'p' });
		const [a, rule] = view.points;
		expect(a.request).toMatchObject({ id: 'r-2', key: 'EVO-002', href: '/projects/p/evolution?request=r-2', solo: false, findingIds: ['gap-rules-issue-ambiguity-a'], undoable: true });
		expect(rule.request).toMatchObject({ id: 'r-1', key: 'EVO-001', solo: true, findingIds: ['g-1', 'g-2'], undoable: true });
		expect(a.canReject || a.canEvolve).toBe(false);
	});

	it('takes a point back only while its request can still change', () => {
		const frozen = createEvolutionRequest({ id: 'r-1', stage: 'implementation', frozen: true, findingDrafts: [line('gap-rules-issue-ambiguity-a'), line('g-9')] });
		expect(noticedView({ open: [issue('a')], kept: [], requests: [frozen], projectId: 'p' }).points[0].request?.undoable).toBe(false);
		// A request that holds more than the point, or moved on, is never cancelled for it.
		const moved = createEvolutionRequest({ id: 'r-1', stage: 'coherence', findingDrafts: [line('gap-rules-issue-ambiguity-a')] });
		expect(noticedView({ open: [issue('a')], kept: [], requests: [moved], projectId: 'p' }).points[0].request?.solo).toBe(false);
	});

	it('reads a point again to review once its request is cancelled or its line landed', () => {
		const cancelled = createEvolutionRequest({ id: 'r-1', status: 'cancelled', findingDrafts: [line('gap-rules-issue-ambiguity-a')] });
		const landed = createEvolutionRequest({ id: 'r-2', findingDrafts: [{ ...line('gap-rules-issue-ambiguity-a'), materialisedAt: '2026-11-01' }] });
		expect(noticedView({ open: [issue('a')], kept: [], requests: [cancelled, landed], projectId: 'p' }).points[0].state).toBe('pending');
	});
});

describe('What Lyriks noticed groups its points by type [criterion:4996a6b4]', () => {
	it('puts the type of the heaviest point first, keeps each group heaviest first and counts its major points', () => {
		const view = noticedView({
			open: [issue('a', 'minor', 'Dead end'), issue('b', 'major', 'Missing rule'), issue('c', 'major', 'Dead end'), check('rule', ['g-1']), computed],
			kept: [],
			requests: [],
			projectId: 'p'
		});
		const groups = noticedGroups(view.points);
		expect(groups.map((g) => [g.kind.label, g.points.map((p) => p.finding.id), g.major])).toEqual([
			['Missing rule', ['issue:b'], 1],
			['Dead end', ['issue:c', 'issue:a'], 1],
			['Final check', ['check:rule'], 1],
			['Table related to nothing', ['computed:orphan-tables'], 0]
		]);
		expect(groups[1].kind.meaning).toBe('What Dead end means');
	});

	it('groups only what the severity leaves', () => {
		const view = noticedView({ open: [issue('a', 'minor', 'Dead end'), issue('b', 'major', 'Missing rule')], kept: [], requests: [], projectId: 'p' });
		expect(noticedGroups(view.points.filter((p) => p.finding.tone === 'minor')).map((g) => g.kind.label)).toEqual(['Dead end']);
	});
});

describe('the Overview sums up What Lyriks noticed, whose list has a page of its own [criterion:55a7fe86]', () => {
	it('reads one line per type, heaviest first, with its count and its major points, and the totals of the bar', () => {
		const request = createEvolutionRequest({ id: 'r-1', stage: 'specification', findingDrafts: [line('gap-rules-issue-ambiguity-c')] });
		const view = noticedView({
			open: [issue('a', 'minor', 'Dead end'), issue('b', 'major', 'Missing rule'), issue('c', 'major', 'Dead end'), computed],
			kept: [issue('d', 'minor', 'Dead end')],
			requests: [request],
			projectId: 'p'
		});
		const summary = noticedSummary(view);
		expect(summary.types.map((t) => [t.key, t.label, t.count, t.major])).toEqual([
			['missing-rule', 'Missing rule', 1, 1],
			['dead-end', 'Dead end', 3, 1],
			['table-related-to-nothing', 'Table related to nothing', 1, 0]
		]);
		// The bar: what waits, major and minor, and what is settled (sent or rejected), all of it adding up.
		expect([summary.total, summary.pending, summary.major, summary.minor, summary.settled]).toEqual([5, 3, 1, 2, 2]);
		expect(summary.major + summary.minor + summary.settled).toBe(summary.total);
	});

	it('keys a type for the address of the page, the same however it is written', () => {
		expect(noticedTypeKey('Dead end')).toBe('dead-end');
		expect(noticedTypeKey('Step without a screen')).toBe('step-without-a-screen');
		expect(noticedTypeKey('  Code / drift  ')).toBe('code-drift');
		expect(noticedTypeKey('???')).toBe('other');
	});
});

describe('several points are composed into one evolution [criterion:3f977777]', () => {
	it('offers the requests still open to changes as targets, newest first, never a frozen, closed, cancelled or deleted one', () => {
		const older = createEvolutionRequest({ id: 'r-1', stage: 'specification', title: 'Settle the findings' });
		const frozen = { ...createEvolutionRequest({ id: 'r-2', stage: 'implementation', title: 'Frozen one' }), frozen: true };
		const cancelled = { ...createEvolutionRequest({ id: 'r-3', title: 'Cancelled one' }), status: 'cancelled' as const };
		const newer = createEvolutionRequest({ id: 'r-4', stage: 'draft', title: '  Tidy the rules  ' });
		const view = noticedView({ open: [], kept: [], requests: [older, frozen, cancelled, newer], projectId: 'p' });
		expect(view.targets.map((t) => [t.id, t.title])).toEqual([
			['r-4', 'Tidy the rules'],
			['r-1', 'Settle the findings']
		]);
		expect(view.targets.every((t) => t.key.startsWith('EVO-') && t.href.includes('/projects/p/'))).toBe(true);
	});
});

describe('a fix waiting for confirmation is no point to review [criterion:2a55c3e7]', () => {
	it('reads apart, in no count of the list nor of the summary, with neither Reject nor a change', () => {
		const fix: Finding = { ...issue('f'), decision: undefined, gapIds: undefined, fix: { issueId: 'f', note: 'Fixed.' } };
		const view = noticedView({ open: [issue('a'), issue('c', 'minor')], kept: [], toConfirm: [fix], requests: [], projectId: 'p' });
		expect([view.total, view.pending, view.major, view.minor]).toEqual([2, 2, 1, 1]);
		expect(view.toConfirm.map((p) => [p.finding.id, p.canReject, p.canEvolve])).toEqual([['issue:f', false, false]]);
		expect(noticedSummary(view)).toMatchObject({ total: 2, pending: 2, toConfirm: 1 });
	});
});

describe('the list narrows by where the problem lies [criterion:c86ea441]', () => {
	it('offers Everywhere and the three origins, a point naming none reading as the specification', () => {
		expect(ORIGIN_FILTERS.map((o) => o.label)).toEqual(['Everywhere', 'In the product', 'In the specification', "In Lyriks's records"]);
		const view = noticedView({ open: [{ ...issue('a'), origin: 'product' }, issue('b')], kept: [], requests: [], projectId: 'p' });
		const [a, b] = view.points;
		expect([showsUnder(a, 'product'), showsUnder(a, 'specification'), showsUnder(a, 'all')]).toEqual([true, false, true]);
		expect([showsUnder(b, 'specification'), showsUnder(b, 'records')]).toEqual([true, false]);
	});
});
