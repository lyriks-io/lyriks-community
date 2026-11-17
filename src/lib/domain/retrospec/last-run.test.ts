import { describe, expect, it } from 'vitest';
import { applyRetrospecActs, type RetrospecAct } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { lastRunOf } from './last-run';
import { runCards } from './run-history';
import { analysisOf, rebuiltFromSourceMode, retrospecFinishedAt, retrospecStatus, type RetrospecFacts } from './status';
import { homeRuns } from '$domain/activity';
import type { HomeSource } from '$domain/activity';
import { NO_READS } from '$domain/activity';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const T0 = '2026-11-04T19:33:00.000Z';
const T1 = '2026-11-05T10:02:00.000Z';
const when = (iso: string) => `at ${iso.slice(11, 16)}`;

function doc(acts: RetrospecAct[], now = T0): RetrospecDocument {
	const outcome = applyRetrospecActs(emptyRetrospecDocument(), acts, { actor: ana, now });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
}

const facts = (over: Partial<RetrospecFacts> = {}): RetrospecFacts => ({
	doc: emptyRetrospecDocument(),
	revisions: {},
	auditTimes: [],
	rebuiltFrom: null,
	hasSpec: false,
	...over
});

describe('a product rebuilt from its documentation goes through the Reverse-Specification [criterion:029a8736]', () => {
	it('reads the AI’s work from the documentation as a run, never as one not started', () => {
		expect(rebuiltFromSourceMode('from_document')).toBe('docs');
		expect(rebuiltFromSourceMode('code_to_spec')).toBe('repo');
		expect(rebuiltFromSourceMode('greenfield')).toBeNull();
		// Taskora: built by its AI from a Confluence export, no run started from the page.
		const written = facts({ rebuiltFrom: 'docs', hasSpec: true, revisions: { documents: 2, scope: 3, features: 4 } });
		expect(retrospecStatus(written).status).toBe('running');
		expect(analysisOf(written).progress.phases[0].label).toBe('Reading your documentation');
		const checked = { ...written, auditTimes: [T1] };
		expect(retrospecStatus(checked)).toMatchObject({ status: 'bilan', ending: { checkedAt: T1 } });
		// The drawer of the version line lists it as the current run, from the documentation.
		expect(runCards(checked.doc, 'bilan', 'docs')).toEqual([expect.objectContaining({ mode: 'docs', status: 'ready', current: true, startedBy: 'Lyriks' })]);
		// A project described by its team has no Reverse-Specification of its own.
		expect(retrospecStatus({ ...checked, rebuiltFrom: null }).status).toBe('start');
		expect(runCards(emptyRetrospecDocument(), 'start', null)).toEqual([]);
	});

	it('opens the review on a run from the documentation', () => {
		const reviewed = doc([{ op: 'start_review', total: 40 }]);
		expect(reviewed.runs[0].implicit).toBe(true);
		const status = retrospecStatus(facts({ doc: reviewed, rebuiltFrom: 'docs', hasSpec: true }));
		expect(status.status).toBe('review');
		expect(runCards(reviewed, status.status, 'docs')[0]).toMatchObject({ mode: 'docs', status: 'review' });
	});
});

describe('Home says where the last Reverse-Specification of each project stands [criterion:a0959413]', () => {
	const last = (f: RetrospecFacts, paused = false) => lastRunOf({ status: retrospecStatus(f), doc: f.doc, rebuiltFrom: f.rebuiltFrom, productName: 'Taskora', paused, when });

	it('names the state of the last run and what it means', () => {
		const started = doc([{ op: 'start', mode: 'docs', baseline: {} }]);
		expect(last(facts({ doc: started, rebuiltFrom: 'docs' }))).toEqual({
			state: 'not_launched',
			title: 'Reverse-Specification of Taskora',
			source: 'From the documentation · started at 19:33',
			detail: 'The prompt was not run yet'
		});
		const reading = facts({ rebuiltFrom: 'docs', hasSpec: true, revisions: { documents: 2, scope: 3, features: 4 } });
		const pct = retrospecStatus(reading).pct;
		expect(last(reading)).toMatchObject({ state: 'running', source: 'From the documentation', detail: `${pct} % read` });
		expect(last(reading, true)).toMatchObject({ state: 'paused', detail: `Stopped at ${pct} %: your LLM stopped calling Lyriks` });
		expect(last({ ...reading, auditTimes: [T1] })).toMatchObject({ state: 'complete', detail: 'Lyriks ran its final check at 10:02. Ready to review' });
	});

	it('reads partial a run a person closed before the AI ran its final check', () => {
		const closed = doc([{ op: 'start', mode: 'repo', baseline: {} }, { op: 'launch' }, { op: 'end_analysis' }]);
		const f = facts({ doc: closed, rebuiltFrom: 'repo', hasSpec: true, revisions: { documents: 1, scope: 1 } });
		const status = retrospecStatus(f);
		expect(status.status).toBe('bilan');
		expect(status.ending).toEqual({ closedAtPct: expect.any(Number) });
		const pct = (status.ending as { closedAtPct: number }).closedAtPct;
		expect(pct).toBeLessThan(100);
		expect(last(f)).toMatchObject({ state: 'partial', detail: `Closed by Ana P. at ${pct} %, before Lyriks ran its final check` });
	});

	it('counts the review, then names who validated it', () => {
		const reviewing = doc([{ op: 'start_review', total: 3 }, { op: 'validate', itemId: 'a', title: 'A', tab: 'data' }]);
		expect(last(facts({ doc: reviewing, rebuiltFrom: 'repo' }))).toMatchObject({ state: 'review', detail: '1 of 3 validated' });
		const published = doc([{ op: 'start_review', total: 1 }, { op: 'publish', baselineId: null }]);
		expect(last(facts({ doc: published, rebuiltFrom: 'repo' }))).toMatchObject({ state: 'validated', detail: 'Validated by Ana P. at 19:33' });
		// Never had one: no row.
		expect(last(facts({ rebuiltFrom: 'docs' }))).toBeNull();
	});

	it('reads as a card of Running now, one per project whose run waits or works', () => {
		const project = (id: string, name: string, run: HomeSource['run']): HomeSource => ({ id, name, requests: [], reads: NO_READS, run, drift: null, mayEdit: true });
		const row = { state: 'complete' as const, title: 'x', source: 'From the code', detail: 'y', href: '/projects/x/spec?retro', pct: 100 };
		const cards = homeRuns([project('t', 'Taskora', { ...row, title: 'Reverse-Specification of Taskora', at: T1 }), project('n', 'None', null), project('a', 'Alpha', { ...row, at: T0 })], {
			me: 'me',
			roster: [],
			now: Date.parse(T1)
		});
		expect(cards.map((c) => [c.project, c.state, c.line])).toEqual([
			['Alpha', 'waiting', 'y'],
			['Taskora', 'waiting', 'y']
		]);
		expect(cards[0]).toMatchObject({ projectId: 'a', kind: 'reverse_specification', label: 'Reverse-Specification', href: '/projects/x/spec?retro' });
	});
});

describe('when the Reverse-Specification finished, for the AI to stop [criterion:45933ee4]', () => {
	it('is the AI’s final check or the validation, never a run under way, in review or closed by a person', () => {
		const reading = facts({ rebuiltFrom: 'repo', hasSpec: true, revisions: { documents: 1, scope: 1 } });
		expect(retrospecFinishedAt(retrospecStatus(reading), reading.doc)).toBeNull();
		const checked = { ...reading, auditTimes: [T1] };
		expect(retrospecFinishedAt(retrospecStatus(checked), checked.doc)).toBe(T1);
		const closed = facts({ doc: doc([{ op: 'start', mode: 'repo', baseline: {} }, { op: 'launch' }, { op: 'end_analysis' }]), rebuiltFrom: 'repo' });
		expect(retrospecFinishedAt(retrospecStatus(closed), closed.doc)).toBeNull();
		const reviewing = facts({ doc: doc([{ op: 'start_review', total: 3 }]), rebuiltFrom: 'repo' });
		expect(retrospecFinishedAt(retrospecStatus(reviewing), reviewing.doc)).toBeNull();
		const published = facts({ doc: doc([{ op: 'start_review', total: 1 }, { op: 'publish', baselineId: null }]), rebuiltFrom: 'repo' });
		expect(retrospecFinishedAt(retrospecStatus(published), published.doc)).toBe(T0);
	});
});
