import { describe, expect, it } from 'vitest';
import { applyRetrospecAct, type ActContext, type RetrospecAct } from './acts';
import { parseRetrospecDocument, type RetrospecDocument, type RetrospecRun } from './document';
import { heldDelta, reportCards, reportCounts, revertBrief, reworkRejectedPrompt, writesHeld, writingProgress, type ReportedChange } from './run-report';
import { specState } from './spec-validation';
import { analysisOf } from './status';

const ann = { id: 'ann@x.io', name: 'Ann' };
const ctx: ActContext = { actor: ann, now: '2026-11-09T12:00:00.000Z' };
const product = { name: 'Kutt', id: 'kutt-1' };
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
const change = (id: string, over: Partial<ReportedChange> = {}): ReportedChange => ({ id, kind: 'changed', anchor: 'action:f:a', dock: null, title: 'Sign in', proposed: 'Sign in with a key', code: 'if (key)', where: 'src/a.ts:1', writes: [{ featureId: 'f', operations: [{ kind: 'update_action' }] }], decision: null, ...over });
const published = run('run-1', { publishedAt: '2026-11-01T10:00:00.000Z', publishedBy: ann });
const held = (over: Partial<RetrospecRun> = {}) => run('run-2', { holds: true, complementary: { fromRunId: 'run-1', fromCommit: null, scope: 'delta' }, report: { c1: change('c1') }, ...over });
const docOf = (...runs: RetrospecRun[]): RetrospecDocument => ({ version: 1, runs, comments: {} });

function acted(doc: RetrospecDocument, act: RetrospecAct): RetrospecDocument {
	const outcome = applyRetrospecAct(doc, act, ctx);
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.doc;
}
const refusal = (doc: RetrospecDocument, act: RetrospecAct) => {
	const outcome = applyRetrospecAct(doc, act, ctx);
	return outcome.ok ? null : outcome.reason;
};
const last = (doc: RetrospecDocument) => doc.runs.at(-1) as RetrospecRun;
const decided = (verdict: 'validated' | 'reverted' | 'rejected', note?: string) => ({ verdict, by: ann, at: 'x', ...(note ? { note } : {}) });

describe('a rejected change goes back to the AI with what must change', () => {
	const rejected = docOf(published, held({ report: { c1: change('c1', { decision: decided('rejected', 'Say 30 days') }) } }));
	const reworded = { ...change('c1'), proposed: 'Expires after 30 days' };

	it('rejects nothing without saying what must change', () => {
		const doc = docOf(published, held());
		expect(refusal(doc, { op: 'decide_change', id: 'c1', verdict: 'rejected' })).toContain('Say what must change');
		expect(refusal(doc, { op: 'decide_change', id: 'c1', verdict: 'rejected', note: '   ' })).toContain('Say what must change');
		expect(last(acted(doc, { op: 'decide_change', id: 'c1', verdict: 'rejected', note: ' Say 30 days ' })).report?.c1.decision).toEqual({ verdict: 'rejected', by: ann, at: ctx.now, note: 'Say 30 days' });
	});

	it('reads to decide again once reported in other words, beside what was asked [criterion:795a0461]', () => {
		const after = last(acted(rejected, { op: 'report_changes', changes: [reworded] })).report?.c1;
		expect(after?.decision).toBeNull();
		expect(after?.rework).toEqual({ note: 'Say 30 days', by: ann, at: 'x' });
	});

	it('stays rejected when reported in the same words', () => {
		expect(last(acted(rejected, { op: 'report_changes', changes: [change('c1')] })).report?.c1.decision?.verdict).toBe('rejected');
	});

	it('writes nothing while a change stays rejected, and comes back to the writing once reworked and validated', () => {
		const mixed = docOf(published, held({ report: { c1: change('c1', { decision: decided('validated') }), c2: change('c2', { decision: decided('rejected', 'Say 30 days') }) } }));
		expect(refusal(mixed, { op: 'open_writing' })).toContain('your AI reworks it first');
		const back = acted(acted(mixed, { op: 'report_changes', changes: [{ ...change('c2'), proposed: 'Other' }] }), { op: 'decide_change', id: 'c2', verdict: 'validated' });
		expect(last(acted(back, { op: 'open_writing' })).writingOpenedAt).toBe(ctx.now);
	});

	it('lets the AI withdraw a rejected change and nothing else', () => {
		expect(last(acted(rejected, { op: 'withdraw_changes', ids: ['c1'] })).report).toEqual({});
		expect(refusal(docOf(published, held()), { op: 'withdraw_changes', ids: ['c1'] })).toContain('only a rejected change');
		expect(refusal(docOf(published, held({ report: { c1: change('c1', { decision: decided('validated') }) } })), { op: 'withdraw_changes', ids: ['c1'] })).toContain('only a rejected change');
		expect(refusal(docOf(published, held({ report: { c1: change('c1', { decision: decided('rejected', 'x') }) }, writingOpenedAt: 'w' })), { op: 'withdraw_changes', ids: ['c1'] })).toContain('being written');
	});

	it('keeps what was asked through the store', () => {
		const reread = parseRetrospecDocument(JSON.parse(JSON.stringify(acted(rejected, { op: 'report_changes', changes: [reworded] }))));
		expect(last(reread).report?.c1.rework?.note).toBe('Say 30 days');
		const stillRejected = parseRetrospecDocument(JSON.parse(JSON.stringify(rejected)));
		expect(last(stillRejected).report?.c1.decision?.note).toBe('Say 30 days');
	});

	it('names what the AI reads and what it may do in the rework prompt [criterion:826f73ae]', () => {
		const prompt = reworkRejectedPrompt(2, product);
		expect(prompt).toContain('With the Lyriks MCP, rework the 2 changes a person rejected on Mismatch for Kutt (Lyriks project kutt-1)');
		expect(prompt).toContain('Write nothing in the specification.');
		expect(prompt).toContain('report_retrospec_reading with project_id alone to read the report: each rejected change carries in asked what must change');
		expect(prompt).toContain('report each one again with report_retrospec_reading (changes), under the same id and worded as the person asked');
		expect(prompt).toContain('withdrawn: [its id]');
		expect(prompt).toContain('Touch no other change of the report.');
	});
});

describe('a later run writes nothing in the specification before a person validates it [criterion:50b00229]', () => {
	it('holds what it finds from the moment a later run starts, a first run writing as it reads', () => {
		const first = acted(docOf(), { op: 'start', mode: 'repo', baseline: {} });
		expect(last(first).holds).toBeUndefined();
		const later = acted(docOf(published), { op: 'start', mode: 'repo', baseline: { features: 3 } });
		expect(last(later).holds).toBe(true);
		expect(writesHeld(last(later))).toBe(true);
	});

	it('keeps the specification validated while it holds, and reads draft again once the writing opened', () => {
		expect(specState(docOf(published, held()))).toBe('validated');
		expect(specState(docOf(published, held({ writingOpenedAt: 'x' })))).toBe('draft');
		expect(specState(docOf(held()))).toBe('draft');
	});

	it('keeps holding the AI while Lyriks writes what was validated, until the run is validated [criterion:c3f9ddbb]', () => {
		expect(writesHeld(held({ writingOpenedAt: 'x' }))).toBe(true);
		expect(writesHeld(held({ writingOpenedAt: 'x', publishedAt: 'y' }))).toBe(false);
		expect(writesHeld(run('old', { complementary: { fromRunId: null, fromCommit: null, scope: 'delta' } }))).toBe(false);
	});

	it('takes a difference on the report, and a report read again keeps its decision while it says the same', () => {
		const doc = docOf(published, held({ report: { c1: change('c1', { decision: decided('validated') }) } }));
		const { decision: _d, ...input } = change('c1');
		expect(last(acted(doc, { op: 'report_changes', changes: [input] })).report?.c1.decision?.verdict).toBe('validated');
		expect(last(acted(doc, { op: 'report_changes', changes: [{ ...input, proposed: 'Other words' }] })).report?.c1.decision).toBeNull();
	});

	it('refuses a report on a run that does not hold, and once the writing opened', () => {
		const { decision: _d, ...input } = change('c1');
		expect(refusal(docOf(published), { op: 'report_changes', changes: [input] })).toContain('holds its changes');
		expect(refusal(docOf(published, held({ writingOpenedAt: 'x' })), { op: 'report_changes', changes: [input] })).toContain('being written');
	});

	it('reads ready to review once its AI says it read what it had to', () => {
		const facts = (r: RetrospecRun) => ({ doc: docOf(published, r), revisions: {}, auditTimes: [], rebuiltFrom: null, hasSpec: true });
		expect(analysisOf(facts(held())).finished).toBe(false);
		const doneReading = last(acted(docOf(published, held()), { op: 'end_reading' }));
		const read = analysisOf(facts(doneReading));
		expect(read.finished).toBe(true);
		expect(read.checkedAt).toBe(ctx.now);
	});

	it('counts what it found as what another run changed, nothing of it written yet', () => {
		const delta = heldDelta(held({ report: { a: change('a', { kind: 'new', anchor: null, dock: 'feature:f', title: 'Refund' }), b: change('b'), c: change('c', { kind: 'removed', anchor: 'rule:f:r', title: 'Old rule' }) } }), Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, title: '' })));
		expect([delta.added.length, delta.changed.length, delta.removed.length, delta.total]).toEqual([1, 1, 1, 12]);
		expect(delta.added[0]).toMatchObject({ kind: 'Feature', title: 'Refund' });
	});

	it('docks what it found where it sits in the specification [criterion:03192a6e]', () => {
		const elements = [
			{ id: 'action:f:a', title: 'Sign in', place: 'Access › Accounts' },
			{ id: 'rule:f:r', title: 'A rule', place: 'Access › Accounts', under: 'action:f:a' }
		];
		const delta = heldDelta(held({ report: { b: change('b', { anchor: 'rule:f:r', title: 'As reported' }) } }), elements);
		expect(delta.changed[0]).toMatchObject({ title: 'As reported', place: 'Access › Accounts', under: { id: 'action:f:a', title: 'Sign in' } });
	});

	it('survives a save', () => {
		const stored = parseRetrospecDocument(JSON.parse(JSON.stringify(docOf(published, held({ report: { c1: change('c1', { decision: decided('rejected') }) }, readingDoneAt: 'r', writingOpenedAt: 'w' })))));
		expect(last(stored)).toMatchObject({ holds: true, readingDoneAt: 'r', writingOpenedAt: 'w', report: { c1: { kind: 'changed', decision: { verdict: 'rejected' } } } });
	});
});

describe('each change of a later run is decided on Mismatch, docked on the specification as it reads today [criterion:42311513]', () => {
	const readOf = (anchor: string) => (anchor === 'action:f:a' ? { title: 'Sign in', detail: 'With a password', place: 'Access › Accounts' } : anchor === 'feature:f' ? { title: 'Accounts', detail: null, place: 'Access › Accounts' } : null);
	const cardsOf = (...changes: ReportedChange[]) => reportCards(Object.fromEntries(changes.map((c) => [c.id, c])), readOf, ['feature:f', 'action:f:a'], product);

	it('validates every card still open in one act, however many, and leaves the decided ones as they were', () => {
		const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`c${i}`, change(`c${i}`)]));
		const report = { ...many, c0: change('c0', { decision: decided('rejected', 'Say 30 days') }) };
		const doc = docOf(published, held({ report }));
		const after = last(acted(doc, { op: 'validate_changes', ids: [...Object.keys(report), 'gone'] })).report ?? {};
		expect(reportCounts(after)).toEqual({ total: 250, pending: 0, validated: 249, reverted: 0, rejected: 1 });
		expect(after.c1.decision).toEqual({ verdict: 'validated', by: ann, at: ctx.now });
		expect(after.c0.decision).toEqual(decided('rejected', 'Say 30 days'));
	});

	it('validates only the cards it names: one reported again meanwhile waits to be seen', () => {
		const doc = docOf(published, held({ report: { c1: change('c1'), c2: change('c2') } }));
		const report = last(acted(doc, { op: 'validate_changes', ids: ['c1'] })).report;
		expect(report?.c1.decision?.verdict).toBe('validated');
		expect(report?.c2.decision).toBeNull();
		const decidedAlready = docOf(published, held({ report: { c1: change('c1', { decision: decided('reverted') }) } }));
		expect(acted(decidedAlready, { op: 'validate_changes', ids: ['c1'] })).toBe(decidedAlready);
		expect(refusal(docOf(published, held({ writingOpenedAt: 'x' })), { op: 'validate_changes', ids: ['c1'] })).toContain('no longer change');
		expect(refusal(docOf(published), { op: 'validate_changes', ids: ['c1'] })).toContain('No Reverse-Specification holds');
	});

	it('reads a change beside what the specification says of the element today', () => {
		expect(cardsOf(change('c1'))[0]).toMatchObject({ current: 'Sign in: With a password', place: 'Access › Accounts', proposed: 'Sign in with a key', anchor: 'action:f:a' });
	});

	it('docks a new element on the one it attaches to', () => {
		expect(cardsOf(change('c1', { kind: 'new', anchor: null, dock: 'feature:f', title: 'Refund' }))[0]).toMatchObject({ current: null, dockedOn: 'Accounts', place: 'Access › Accounts', anchor: 'feature:f' });
	});

	it('orders the cards as the pages, what they cannot place last', () => {
		const ids = cardsOf(change('later', { anchor: 'action:f:a' }), change('first', { kind: 'new', anchor: null, dock: 'feature:f' }), change('lost', { anchor: 'term:gone' })).map((c) => c.id);
		expect(ids).toEqual(['first', 'later', 'lost']);
	});

	it('says of a missing element its kind, never a blank place', () => {
		expect(cardsOf(change('lost', { anchor: 'term:gone' }))[0]).toMatchObject({ current: null, place: 'Term', anchor: null });
	});

	it('takes a decision with who and when, and takes it back until the writing starts', () => {
		const doc = docOf(published, held());
		const report = last(acted(doc, { op: 'decide_change', id: 'c1', verdict: 'reverted' })).report;
		expect(report?.c1.decision).toEqual({ verdict: 'reverted', by: ann, at: ctx.now });
		const again = acted(acted(doc, { op: 'decide_change', id: 'c1', verdict: 'rejected', note: 'Say 30 days' }), { op: 'decide_change', id: 'c1', verdict: null });
		expect(last(again).report?.c1.decision).toBeNull();
		expect(refusal(docOf(published, held({ writingOpenedAt: 'x' })), { op: 'decide_change', id: 'c1', verdict: 'validated' })).toContain('no longer change');
		expect(refusal(doc, { op: 'decide_change', id: 'nope', verdict: 'validated' })).toContain('not on the report');
	});

	it('words the revert brief from what the specification and the code read, and leaves the specification', () => {
		const brief = revertBrief(change('c1'), 'Sign in: With a password', product);
		expect(brief).toContain('The specification says: Sign in: With a password.');
		expect(brief).toContain('The code reads: if (key) (src/a.ts:1).');
		expect(brief).toContain('Do not change the specification.');
		expect(revertBrief(change('n', { kind: 'new', anchor: null, title: 'Refund' }), null, product)).toContain('Take it out of the code.');
		expect(revertBrief(change('r', { kind: 'removed' }), 'Old', product)).toContain('Put it back in the code.');
	});

	it('counts what is left to decide', () => {
		expect(reportCounts({ a: change('a'), b: change('b', { decision: decided('validated') }), c: change('c', { decision: decided('reverted') }), d: change('d', { decision: decided('rejected') }) })).toEqual({ total: 4, pending: 1, validated: 1, reverted: 1, rejected: 1 });
	});
});

describe('what a person validated on Mismatch is written once, by Lyriks itself [criterion:1aaa8316]', () => {
	const validated = { c1: change('c1', { decision: decided('validated') }) };
	const twoWrites = { c1: change('c1', { decision: decided('validated'), writes: [{ featureId: 'f', operations: [{ kind: 'update_action' }] }, { section: 'glossary', edits: [{ op: 'set', path: 'terms', value: [] }] }] }) };

	it('opens the writing only with nothing left to decide and something validated', () => {
		expect(refusal(docOf(published, held()), { op: 'open_writing' })).toContain('Decide every change');
		expect(refusal(docOf(published, held({ report: { c1: change('c1', { decision: decided('rejected') }) } })), { op: 'open_writing' })).toContain('nothing to write');
		expect(last(acted(docOf(published, held({ report: validated })), { op: 'open_writing' })).writingOpenedAt).toBe(ctx.now);
	});

	it('records each write as it lands, and reads the change validated by who validated it once all are [criterion:114be880]', () => {
		const doc = docOf(published, held({ report: twoWrites, writingOpenedAt: 'w' }));
		const half = acted(doc, { op: 'record_writes', change: 'c1', done: 1, elements: [] });
		expect(writingProgress(last(half))).toMatchObject({ written: 0, next: { done: 1 } });
		expect(last(half).verdicts['action:f:a']).toBeUndefined();
		const whole = last(acted(half, { op: 'record_writes', change: 'c1', done: 2, elements: ['action:f:a'] }));
		expect(writingProgress(whole)).toMatchObject({ written: 1, next: null });
		expect(whole.verdicts['action:f:a']).toMatchObject({ title: 'Sign in', validatedBy: [{ person: ann, at: 'x' }], flag: null });
	});

	it('refuses what was not sent, and a change nobody validated', () => {
		const write = { op: 'record_writes' as const, change: 'c1', done: 1, elements: [] };
		expect(refusal(docOf(published, held({ report: validated })), write)).toContain('Nothing was sent');
		expect(refusal(docOf(published, held({ report: { c1: change('c1', { decision: decided('rejected') }) }, writingOpenedAt: 'w' })), write)).toContain('not validated');
	});

	it('keeps where the writing stopped until a person starts it again [criterion:5aec3583]', () => {
		const doc = docOf(published, held({ report: validated, writingOpenedAt: 'w' }));
		const stopped = acted(doc, { op: 'record_write_stop', change: 'c1', reason: 'the engine did not answer.' });
		expect(writingProgress(last(stopped)).stop).toMatchObject({ change: 'c1', reason: 'the engine did not answer.' });
		expect(last(acted(stopped, { op: 'write_remaining' })).writeStop).toBeNull();
		const done = acted(doc, { op: 'record_writes', change: 'c1', done: 1, elements: [] });
		expect(refusal(done, { op: 'write_remaining' })).toBe('Every validated change is written.');
		expect(refusal(docOf(published, held({ report: validated })), { op: 'write_remaining' })).toBe('Nothing was sent to be written yet.');
	});

	it('leaves out only the change the writing stopped at, and the writing goes on with the others [criterion:5aec3583]', () => {
		const two = { ...validated, c2: change('c2', { decision: decided('validated') }) };
		const stopped = acted(docOf(published, held({ report: two, writingOpenedAt: 'w' })), { op: 'record_write_stop', change: 'c1', reason: 'gone' });
		expect(refusal(stopped, { op: 'leave_out_change', id: 'c2' })).toBe('The writing did not stop at this change.');
		const left = last(acted(stopped, { op: 'leave_out_change', id: 'c1' }));
		expect(Object.keys(left.report ?? {})).toEqual(['c2']);
		expect(writingProgress(left)).toMatchObject({ stop: null, next: { change: { id: 'c2' } } });
	});
});
