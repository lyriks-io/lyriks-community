import { describe, expect, it } from 'vitest';
import { historyLines, parseHistory } from './action-history';
import { applyRetrospecAct, type ActContext, type RetrospecAct } from './acts';
import { parseRetrospecDocument, type RetrospecDocument, type RetrospecRun } from './document';
import type { ReportedChange } from './run-report';

const ann = { id: 'ann@x.io', name: 'Ann' };
const ctx = (now = '2026-11-10T09:30:00.000Z'): ActContext => ({ actor: ann, now });
const run = (id: string, over: Partial<RetrospecRun> = {}): RetrospecRun => ({
	id,
	mode: 'repo',
	implicit: false,
	startedAt: '2026-11-09T10:00:00.000Z',
	startedBy: ann,
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
const change = (id: string, over: Partial<ReportedChange> = {}): ReportedChange => ({ id, kind: 'changed', anchor: 'action:f:a', dock: null, title: 'Sign in', proposed: 'With a key', code: '', where: '', decision: null, ...over });
const published = run('run-1', { publishedAt: '2026-11-01T10:00:00.000Z', publishedBy: ann });
const held = (over: Partial<RetrospecRun> = {}) => run('run-2', { holds: true, complementary: { fromRunId: 'run-1', fromCommit: null, scope: 'delta' }, report: { c1: change('c1') }, ...over });
const docOf = (...runs: RetrospecRun[]): RetrospecDocument => ({ version: 1, runs, comments: {} });

function acted(doc: RetrospecDocument, act: RetrospecAct, at?: string): RetrospecDocument {
	const outcome = applyRetrospecAct(doc, act, ctx(at));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
}
const whats = (doc: RetrospecDocument) => historyLines(doc).map((l) => l.what);

describe('every action on Mismatch stays in a history only administrators read [criterion:64d191d6]', () => {
	it('names who decided what, and what must change', () => {
		const doc = acted(docOf(published, held()), { op: 'decide_change', id: 'c1', verdict: 'rejected', note: 'Say 30 days' });
		expect(historyLines(doc)).toEqual([{ at: '2026-11-10T09:30:00.000Z', who: 'Ann', through: null, what: 'rejected “Sign in”', note: 'Say 30 days' }]);
	});

	it('keeps a decision taken back, as one more line', () => {
		const doc = docOf(published, held());
		const decided = acted(doc, { op: 'decide_change', id: 'c1', verdict: 'validated' }, '2026-11-10T09:00:00.000Z');
		const back = acted(decided, { op: 'decide_change', id: 'c1', verdict: null }, '2026-11-10T09:05:00.000Z');
		expect(whats(back)).toEqual(['took back the decision on “Sign in”', 'validated “Sign in”']);
		expect(historyLines(back)[0].note).toBe('It read Validated.');
	});

	it('survives the run it speaks of: a closed report takes the run away, not its lines', () => {
		const doc = acted(docOf(published, held({ readingDoneAt: 'x' })), { op: 'decide_change', id: 'c1', verdict: 'reverted' });
		const closed = acted(doc, { op: 'cancel' });
		expect(closed.runs).toHaveLength(1);
		expect(whats(closed)).toContain('closed the report: nothing was written');
		expect(whats(closed).some((w) => w.startsWith('reverted'))).toBe(true);
	});

	it('reads a run cancelled before it reported as cancelled', () => {
		expect(whats(acted(docOf(published, held()), { op: 'cancel' }))).toEqual(['cancelled the Reverse-Specification']);
	});

	it('reads what the AI did as the work of Lyriks, through whose AI', () => {
		const doc = acted(docOf(published, held({ report: {} })), { op: 'report_changes', changes: [change('c1'), change('c2')] });
		expect(historyLines(doc)).toEqual([{ at: '2026-11-10T09:30:00.000Z', who: 'Lyriks', through: 'Ann', what: 'reported 2 differences', note: null }]);
	});

	it('reads a rework beside its new words, and a report in the same words as nothing', () => {
		const rejected = docOf(published, held({ report: { c1: change('c1', { decision: { verdict: 'rejected', by: ann, at: 'x', note: 'n' } }) } }));
		const reworked = acted(rejected, { op: 'report_changes', changes: [{ ...change('c1'), proposed: 'Other words' }] });
		expect(historyLines(reworked)).toMatchObject([{ what: 'reworked “Sign in”', note: 'Other words' }]);
		expect(historyLines(acted(rejected, { op: 'report_changes', changes: [change('c1')] }))).toEqual([]);
	});

	it('names a withdrawn change once its card is gone', () => {
		const rejected = docOf(published, held({ report: { c1: change('c1', { decision: { verdict: 'rejected', by: ann, at: 'x', note: 'n' } }) } }));
		expect(whats(acted(rejected, { op: 'withdraw_changes', ids: ['c1'] }))).toEqual(['withdrew “Sign in”: it was not a change']);
	});

	it('says what a run reads when it is launched', () => {
		const later = acted(docOf(published), { op: 'start', mode: 'repo', baseline: { features: 3 }, scope: 'delta' });
		expect(whats(later)).toEqual(['launched a delta analysis']);
		expect(whats(acted(docOf(published), { op: 'start', mode: 'repo', baseline: { features: 3 }, scope: 'whole' }))).toEqual(['launched a full analysis']);
		expect(whats(acted(later, { op: 'choose_scope', scope: 'whole' }))).toContain('chose to read the whole product');
		expect(whats(acted(docOf(), { op: 'start', mode: 'repo', baseline: {} }))).toEqual(['started the first Reverse-Specification']);
	});

	it('follows the writing, change by change', () => {
		const validated = docOf(published, held({ report: { c1: change('c1', { decision: { verdict: 'validated', by: ann, at: 'x' } }) } }));
		const open = acted(validated, { op: 'open_writing' });
		expect(whats(open)).toEqual(['opened the writing of 1 validated change']);
		expect(whats(acted(open, { op: 'record_written', written: [{ change: 'c1', elements: [] }] }))).toContain('wrote “Sign in” into the specification');
	});

	it('follows the decisions on the code and on the hand edits', () => {
		const validated = docOf(published);
		const kept = acted(validated, { op: 'keep_drift', key: 'rule:r', code: 'x', baselineId: null, title: 'Expiry rule' });
		expect(whats(kept)).toEqual(['accepted the code change on “Expiry rule” into the specification']);
		const undone = acted(kept, { op: 'undo_drift', key: 'rule:r', title: 'Expiry rule' });
		expect(whats(undone)[0]).toBe('undid the decision on the code change “Expiry rule”');
		expect(whats(acted(validated, { op: 'send_back_drift', key: 'rule:r', code: 'x' }))).toEqual(['rejected the code change on “rule:r”: the code must follow the specification']);
	});

	it('keeps one line per change Validate all validated, none for one decided before', () => {
		const doc = docOf(published, held({ report: { c1: change('c1'), c2: change('c2', { title: 'Sign out' }), c3: change('c3', { decision: { verdict: 'reverted', by: ann, at: 'x' } }) } }));
		const all = acted(doc, { op: 'validate_changes', ids: ['c1', 'c2', 'c3'] });
		expect(whats(all).toSorted()).toEqual(['validated “Sign in”', 'validated “Sign out”']);
		expect(acted(all, { op: 'validate_changes', ids: ['c1', 'c2'] }).history).toEqual(all.history);
	});

	it('adds nothing for an act that changed nothing or was refused', () => {
		const launched = docOf(published, held({ launchedAt: 'x' }));
		expect(acted(launched, { op: 'launch' }).history).toBeUndefined();
		const done = docOf(published, held({ readingDoneAt: 'x' }));
		expect(acted(done, { op: 'end_reading' }).history).toBeUndefined();
		expect(applyRetrospecAct(docOf(published, held()), { op: 'decide_change', id: 'nope', verdict: 'validated' }, ctx()).ok).toBe(false);
	});

	it('leaves the review in Knowledge out', () => {
		expect(acted(docOf(run('run-1', { reviewStartedAt: 'x' })), { op: 'validate', itemId: 'feature:f', title: 'F', tab: 'spec360' }).history).toBeUndefined();
	});

	it('reads newest first', () => {
		const doc = acted(docOf(published, held({ report: {} })), { op: 'report_changes', changes: [change('c1')] }, '2026-11-10T08:00:00.000Z');
		const rejected = acted(acted(doc, { op: 'decide_change', id: 'c1', verdict: 'validated' }, '2026-11-10T08:30:00.000Z'), { op: 'decide_change', id: 'c1', verdict: null }, '2026-11-10T08:40:00.000Z');
		expect(historyLines(rejected).map((l) => l.at)).toEqual(['2026-11-10T08:40:00.000Z', '2026-11-10T08:30:00.000Z', '2026-11-10T08:00:00.000Z']);
	});

	it('goes through the store whole, and drops a line that does not read', () => {
		const doc = acted(docOf(published, held()), { op: 'decide_change', id: 'c1', verdict: 'rejected', note: 'Say 30 days' });
		expect(parseRetrospecDocument(JSON.parse(JSON.stringify(doc))).history).toEqual(doc.history);
		expect(parseHistory([{ at: 'x', by: { id: 'a' }, action: 'not_an_action' }, 'nonsense'])).toEqual([]);
		expect(parseHistory('nope')).toEqual([]);
	});
});
