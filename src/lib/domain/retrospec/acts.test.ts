import { describe, expect, it } from 'vitest';
import { applyRetrospecAct, applyRetrospecActs, waitsForItsPrompt, type ActContext } from './acts';
import { currentRun, emptyRetrospecDocument, parseRetrospecDocument, type RetrospecDocument } from './document';
import { retrospecEvents } from './events';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const at = (min: number) => `2026-10-26T10:${String(min).padStart(2, '0')}:00.000Z`;
const ctx = (actor = ana, min = 0): ActContext => ({ actor, now: at(min) });

function ok(doc: RetrospecDocument, ...steps: [Parameters<typeof applyRetrospecAct>[1], ActContext?][]): RetrospecDocument {
	let current = doc;
	for (const [act, c] of steps) {
		const outcome = applyRetrospecAct(current, act, c ?? ctx());
		if (!outcome.ok) throw new Error(outcome.reason);
		current = outcome.doc;
	}
	return current;
}

const started = () => ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: { features: 3 } }]);

describe('the next run closes a last run whose analysis is over', () => {
	const fingerprints = { a: 'fa', b: 'fb' };
	const inReview = () =>
		ok(started(), [{ op: 'launch' }], [{ op: 'start_review', total: 2 }], [{ op: 'validate', itemId: 'a', title: 'A', tab: 't' }], [{ op: 'reject', itemId: 'b', title: 'B', tab: 't' }]);
	const relaunched = () => ok(inReview(), [{ op: 'start', mode: 'repo', baseline: { features: 9 }, fingerprints, closesRun: true }, ctx(bob, 5)]);

	it('records what the specification read as a later run starts, what it changed is read against [criterion:03192a6e]', () => {
		const titles = { a: 'Element A', b: 'Element B' };
		const doc = ok(inReview(), [{ op: 'start', mode: 'repo', baseline: { features: 9 }, fingerprints, titles, closesRun: true }, ctx(bob, 5)]);
		expect(currentRun(doc)?.atStart).toEqual({ fingerprints, titles });
	});

	it('records nothing when the elements could not be read, so nothing reads as new by mistake [criterion:03192a6e]', () => {
		const doc = ok(inReview(), [{ op: 'start', mode: 'repo', baseline: { features: 9 }, fingerprints: {}, closesRun: true }, ctx(bob, 5)]);
		expect(currentRun(doc)?.atStart).toBeUndefined();
	});

	it('keeps it in the history, closed by who relaunched, and starts a complementary run [criterion:2dbed801]', () => {
		const doc = relaunched();
		expect(doc.runs.map((r) => r.id)).toEqual(['run-1', 'run-2']);
		expect(doc.runs[0]).toMatchObject({ closedAt: at(5), closedBy: bob, publishedAt: null });
		expect(currentRun(doc)).toMatchObject({ id: 'run-2', launchedAt: null, complementary: { fromRunId: null, fromCommit: null } });
	});

	it('closes a run never handed to the AI rather than dropping it [criterion:2dbed801]', () => {
		const doc = ok(started(), [{ op: 'start', mode: 'repo', baseline: {}, closesRun: true }]);
		expect(doc.runs.map((r) => !!r.closedAt)).toEqual([true, false]);
	});

	it('still refuses the start while the analysis is not over [criterion:2dbed801]', () => {
		const refused = applyRetrospecAct(ok(started(), [{ op: 'launch' }]), { op: 'start', mode: 'repo', baseline: {}, closesRun: false }, ctx());
		expect(refused).toEqual({ ok: false, reason: expect.stringContaining('already under way') });
	});

	it('hands on what its review validated, never a rejection [criterion:0c87480c]', () => {
		const carried = currentRun(relaunched())?.carried ?? {};
		expect(Object.keys(carried)).toEqual(['a']);
		expect(carried.a.fingerprint).toBe('fa');
		expect(carried.a.validatedBy.map((v) => v.person)).toEqual([ana]);
	});

	it('hands validations on through several closed runs, while the element reads the same [criterion:0c87480c]', () => {
		const again = (reads: Record<string, string>) => ok(relaunched(), [{ op: 'start_review', total: 1 }], [{ op: 'start', mode: 'repo', baseline: {}, fingerprints: reads, closesRun: true }]);
		expect(Object.keys(currentRun(again(fingerprints))?.carried ?? {})).toEqual(['a']);
		expect(currentRun(again({ a: 'changed' }))?.carried).toEqual({});
	});

	it('gives the closed run back when the next one is cancelled [criterion:0ec7551b]', () => {
		const doc = ok(relaunched(), [{ op: 'cancel' }]);
		expect(doc.runs).toHaveLength(1);
		expect(doc.runs[0].closedAt).toBeNull();
		expect(Object.keys(doc.runs[0].verdicts).sort()).toEqual(['a', 'b']);
	});

	it('reads back closed after a save', () => {
		const saved = parseRetrospecDocument(JSON.parse(JSON.stringify(relaunched())));
		expect(saved.runs[0]).toMatchObject({ closedAt: at(5), closedBy: bob });
	});
});

describe('the run that waits for its prompt [criterion:a6f870af]', () => {
	it('is a run started from its page that no AI said it has the prompt of', () => {
		expect(waitsForItsPrompt(started())).toBe(true);
		expect(waitsForItsPrompt(ok(started(), [{ op: 'launch' }]))).toBe(false);
	});

	it('is none without a run, or once the run is read', () => {
		expect(waitsForItsPrompt(emptyRetrospecDocument())).toBe(false);
		expect(waitsForItsPrompt(ok(started(), [{ op: 'end_analysis' }]))).toBe(false);
		expect(waitsForItsPrompt(ok(started(), [{ op: 'start_review', total: 1 }]))).toBe(false);
	});
});

describe('a retrospecification run', () => {
	it('starts with the baseline it is handed and the person who started it', () => {
		const run = currentRun(started())!;
		expect(run).toMatchObject({ id: 'run-1', mode: 'repo', implicit: false, startedBy: ana, baseline: { features: 3 }, launchedAt: null });
	});

	it('starts over while nobody handed it to the AI, but never drops a run under way', () => {
		const again = ok(started(), [{ op: 'start', mode: 'docs', baseline: {} }]);
		expect(again.runs).toHaveLength(1);
		expect(currentRun(again)?.mode).toBe('docs');
		const launched = ok(started(), [{ op: 'launch' }]);
		const refused = applyRetrospecAct(launched, { op: 'start', mode: 'repo', baseline: {} }, ctx());
		expect(refused).toEqual({ ok: false, reason: expect.stringContaining('already under way') });
	});

	it('runs again once the last run is published, keeping the history', () => {
		const published = ok(started(), [{ op: 'start_review', total: 2 }], [{ op: 'publish', baselineId: 'b-1' }]);
		const again = ok(published, [{ op: 'start', mode: 'repo', baseline: {} }]);
		expect(again.runs.map((r) => r.id)).toEqual(['run-1', 'run-2']);
		expect(again.runs[0].publishedAt).not.toBeNull();
	});

	it('changes its starting point only before the prompt runs', () => {
		expect(currentRun(ok(started(), [{ op: 'choose_mode', mode: 'docs' }]))?.mode).toBe('docs');
		const launched = ok(started(), [{ op: 'launch' }]);
		expect(applyRetrospecAct(launched, { op: 'choose_mode', mode: 'docs' }, ctx()).ok).toBe(false);
	});

	it('refuses to publish a run nobody reviewed', () => {
		expect(applyRetrospecAct(started(), { op: 'publish', baselineId: null }, ctx())).toMatchObject({ ok: false });
	});
});

describe('cancelling a run [criterion:0ec7551b]', () => {
	const first = () => ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }]);
	const published = () => ok(started(), [{ op: 'start_review', total: 2 }], [{ op: 'publish', baselineId: 'b-1' }]);
	const later = () => ok(published(), [{ op: 'start', mode: 'repo', baseline: { features: 5 } }]);

	it('takes a later run away as if it never started, at any moment before its review', () => {
		for (const steps of [[], [[{ op: 'launch' }]], [[{ op: 'launch' }], [{ op: 'end_analysis' }]]] as const) {
			const doc = ok(later(), ...(steps as unknown as [Parameters<typeof applyRetrospecAct>[1]][]), [{ op: 'cancel' }]);
			expect(doc.runs.map((r) => r.id)).toEqual(['run-1']);
			expect(currentRun(doc)?.publishedAt).not.toBeNull();
		}
	});

	it('takes a first run away only before its prompt runs', () => {
		expect(ok(first(), [{ op: 'cancel' }]).runs).toEqual([]);
		const launched = ok(first(), [{ op: 'launch' }]);
		expect(applyRetrospecAct(launched, { op: 'cancel' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('mark the analysis as finished instead') });
	});

	it('never takes away a run in review, a validated one, or none', () => {
		const inReview = ok(later(), [{ op: 'launch' }], [{ op: 'start_review', total: 1 }]);
		expect(applyRetrospecAct(inReview, { op: 'cancel' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('review') });
		expect(applyRetrospecAct(published(), { op: 'cancel' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('validated') });
		expect(applyRetrospecAct(emptyRetrospecDocument(), { op: 'cancel' }, ctx())).toMatchObject({ ok: false });
	});

	it('lets a new run start once one was cancelled', () => {
		const again = ok(later(), [{ op: 'launch' }], [{ op: 'cancel' }], [{ op: 'start', mode: 'docs', baseline: { features: 6 } }]);
		expect(again.runs.map((r) => r.id)).toEqual(['run-1', 'run-2']);
		expect(currentRun(again)).toMatchObject({ mode: 'docs', launchedAt: null });
	});
});

describe('reviewing an item', () => {
	const item = { itemId: 'feature:f1', title: 'Customer records', tab: 'features' };

	it('stamps each person who validates it, once each', () => {
		const doc = ok(started(), [{ op: 'validate', ...item }], [{ op: 'validate', ...item }], [{ op: 'validate', ...item }, ctx(bob, 1)]);
		const verdict = currentRun(doc)!.verdicts['feature:f1'];
		expect(verdict.validatedBy.map((v) => v.person.id)).toEqual([ana.id, bob.id]);
		expect(verdict.title).toBe('Customer records');
		expect(currentRun(doc)!.reviewStartedAt).toBe(at(0));
	});

	it('withdraws only the reader’s own validation', () => {
		const doc = ok(started(), [{ op: 'validate', ...item }], [{ op: 'validate', ...item }, ctx(bob)], [{ op: 'withdraw', itemId: item.itemId }, ctx(bob)]);
		expect(currentRun(doc)!.verdicts['feature:f1'].validatedBy.map((v) => v.person.id)).toEqual([ana.id]);
	});

	it('drops the verdict entirely once nothing stands on it', () => {
		const doc = ok(started(), [{ op: 'validate', ...item }], [{ op: 'withdraw', itemId: item.itemId }]);
		expect(currentRun(doc)!.verdicts).toEqual({});
	});

	it('rejects it for everyone and refuses a validation until it is restored', () => {
		const doc = ok(started(), [{ op: 'validate', ...item }], [{ op: 'reject', ...item }, ctx(bob)]);
		const verdict = currentRun(doc)!.verdicts['feature:f1'];
		expect(verdict).toMatchObject({ validatedBy: [], flag: { kind: 'rejected', by: bob } });
		expect(applyRetrospecAct(doc, { op: 'validate', ...item }, ctx()).ok).toBe(false);
		const restored = ok(doc, [{ op: 'clear_flag', itemId: item.itemId }]);
		expect(currentRun(restored)!.verdicts['feature:f1']).toBeUndefined();
	});

	it('shares it with someone else, and a validation settles the share', () => {
		const shared = ok(started(), [{ op: 'share', ...item, to: bob }]);
		expect(currentRun(shared)!.verdicts['feature:f1'].flag).toMatchObject({ kind: 'shared', to: bob });
		expect(applyRetrospecAct(started(), { op: 'share', ...item, to: ana }, ctx()).ok).toBe(false);
		const validated = ok(shared, [{ op: 'validate', ...item }, ctx(bob)]);
		expect(currentRun(validated)!.verdicts['feature:f1'].flag).toBeNull();
	});

	it('records the item total a person last saw, for the status to read', () => {
		const doc = ok(started(), [{ op: 'validate', ...item, total: 83 }]);
		expect(currentRun(doc)!.itemTotal).toBe(83);
	});

	it('opens a run of its own on a specification nobody started a run for', () => {
		const doc = ok(emptyRetrospecDocument(), [{ op: 'start_review', total: 5 }]);
		expect(currentRun(doc)).toMatchObject({ implicit: true, baseline: {}, reviewStartedAt: at(0), itemTotal: 5 });
	});
});

describe('comments', () => {
	it('keeps comments across runs and resolves them', () => {
		const doc = ok(started(), [{ op: 'comment', itemId: 'role:r1', commentId: 'c1', text: '  Who owns this?  ' }], [{ op: 'resolve_comment', itemId: 'role:r1', commentId: 'c1' }]);
		expect(doc.comments['role:r1']).toEqual([{ id: 'c1', by: ana, at: at(0), text: 'Who owns this?', resolved: true }]);
		expect(applyRetrospecAct(doc, { op: 'comment', itemId: 'role:r1', commentId: 'c2', text: '   ' }, ctx()).ok).toBe(false);
	});
});

describe('a batch of acts', () => {
	it('keeps nothing of a batch one act of which is refused', () => {
		const outcome = applyRetrospecActs(started(), [{ op: 'launch' }, { op: 'publish', baselineId: null }], ctx());
		expect(outcome.ok).toBe(false);
	});
});

describe('parsing the stored document', () => {
	it('reads what it wrote back', () => {
		const doc = ok(started(), [{ op: 'share', itemId: 'x', title: 'X', tab: 'data', to: bob }], [{ op: 'comment', itemId: 'x', commentId: 'c', text: 'hi' }]);
		expect(parseRetrospecDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
	});

	it('drops what it cannot read instead of failing', () => {
		const doc = parseRetrospecDocument({ runs: [{ id: '' }, { id: 'run-1', startedAt: at(0), startedBy: ana, mode: 'weird', verdicts: { a: { validatedBy: [{ person: { id: '' }, at: 'x' }] } } }], comments: { a: [{ id: 'c' }] } });
		expect(doc.runs).toHaveLength(1);
		expect(doc.runs[0].mode).toBe('repo');
		expect(doc.runs[0].verdicts).toEqual({});
		expect(doc.comments).toEqual({});
		expect(parseRetrospecDocument(null)).toEqual(emptyRetrospecDocument());
	});
});

describe('the acts of the Specification 360°', () => {
	const cleo = { id: 'cleo@acme.io', name: 'Cleo D.' };

	it('remembers who asked to be told when the analysis finishes, once each, and lets them take it back', () => {
		let doc = ok(started(), [{ op: 'ask_notify' }], [{ op: 'ask_notify' }], [{ op: 'ask_notify' }, ctx(bob)]);
		expect(currentRun(doc)!.notifyWhenReady).toEqual([ana, bob]);
		doc = ok(doc, [{ op: 'cancel_notify' }]);
		expect(currentRun(doc)!.notifyWhenReady).toEqual([bob]);
		expect(applyRetrospecAct(emptyRetrospecDocument(), { op: 'ask_notify' }, ctx())).toMatchObject({ ok: false });
	});

	it('reminds a validator, never the person reminding', () => {
		const doc = ok(emptyRetrospecDocument(), [{ op: 'remind', itemId: 'problem', title: 'Current situation', to: bob }]);
		expect(currentRun(doc)!.reminders).toEqual([{ itemId: 'problem', title: 'Current situation', by: ana, to: bob, at: at(0) }]);
		expect(applyRetrospecAct(doc, { op: 'remind', itemId: 'problem', title: '', to: ana }, ctx())).toMatchObject({ ok: false });
	});

	it('records the author of an edit, drops every validation and asks the others again with the validated version kept [criterion:e6029af6]', () => {
		const validate = { op: 'validate' as const, itemId: 'problem', title: 'Current situation', tab: 'spec360' };
		let doc = ok(emptyRetrospecDocument(), [validate], [validate, ctx(bob)], [validate, ctx(cleo)]);
		const revalidate = { change: 'edited' as const, before: { text: 'Old', desc: 'As validated' }, after: { text: 'New', desc: 'As proposed' } };
		doc = ok(doc, [{ op: 'edit', itemId: 'problem', title: 'Current situation', revalidate }, ctx(bob, 3)]);
		const run = currentRun(doc)!;
		expect(run.edits?.problem).toEqual({ title: 'Current situation', by: bob, at: at(3) });
		expect(run.verdicts.problem).toBeUndefined();
		expect(doc.revalidations?.problem).toMatchObject({ validated: revalidate.before, proposed: revalidate.after, asked: [ana, cleo], by: bob });
		// A second save before anyone validates again keeps the validated version and moves the proposed one.
		doc = ok(doc, [{ op: 'edit', itemId: 'problem', title: 'Current situation', revalidate: { ...revalidate, before: revalidate.after, after: { text: 'Newer', desc: '' } } }, ctx(bob, 4)]);
		expect(doc.revalidations?.problem).toMatchObject({ validated: revalidate.before, proposed: { text: 'Newer', desc: '' }, asked: [ana, cleo] });
		const events = retrospecEvents(doc, { projectId: 'p', productName: 'P', auditEntries: [] }).filter((e) => e.kind === 'revalidation_asked');
		expect(events.map((e) => e.toName)).toEqual([ana.name, cleo.name]);
	});

	it('publishes with the team told and the code read, and only then follows the code changes', () => {
		const reviewed = ok(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'problem', title: 'Current situation', tab: 'spec360' }]);
		expect(applyRetrospecAct(reviewed, { op: 'keep_drift', key: 'k', code: 'a.ts#x', baselineId: 'b2' }, ctx())).toMatchObject({ ok: false });
		let doc = ok(reviewed, [{ op: 'publish', baselineId: 'b1', notify: [ana, bob], code: { k: 'a.ts#x' } }]);
		const run = currentRun(doc)!;
		expect(run.publishNotified).toEqual([bob]);
		expect(run.codeAtValidation).toEqual({ k: 'a.ts#x' });
		doc = ok(doc, [{ op: 'keep_drift', key: 'k', code: 'a.ts#y', baselineId: 'b2' }], [{ op: 'send_back_drift', key: 'j', code: '' }, ctx(bob)]);
		expect(currentRun(doc)!.drift).toEqual({
			k: { decision: 'kept', by: ana, at: at(0), code: 'a.ts#y', baselineId: 'b2' },
			j: { decision: 'sent_back', by: bob, at: at(0), code: '', baselineId: null }
		});
		// Read back from storage as written.
		expect(currentRun(parseRetrospecDocument(JSON.parse(JSON.stringify(doc))))!.drift).toEqual(currentRun(doc)!.drift);
	});
});

describe('a decision on a code change taken back [criterion:537e1684]', () => {
	const published = () => ok(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'problem', title: 'Current situation', tab: 'spec360' }], [{ op: 'publish', baselineId: 'b1', code: { k: 'a.ts#x' } }]);

	it('reads the change to review again, the other decisions and the version a keep captured left as they were', () => {
		let doc = ok(published(), [{ op: 'keep_drift', key: 'k', code: 'a.ts#y', baselineId: 'b2' }], [{ op: 'send_back_drift', key: 'j', code: '' }]);
		doc = ok(doc, [{ op: 'undo_drift', key: 'k' }]);
		expect(currentRun(doc)!.drift).toEqual({ j: { decision: 'sent_back', by: ana, at: at(0), code: '', baselineId: null } });
		// Accepted again, it captures a new version: the one taken back stays in the history.
		doc = ok(doc, [{ op: 'keep_drift', key: 'k', code: 'a.ts#y', baselineId: 'b3' }]);
		expect(currentRun(doc)!.drift?.k).toMatchObject({ decision: 'kept', baselineId: 'b3' });
	});

	it('refuses to take back a decision nobody took, or before the specification is validated', () => {
		expect(applyRetrospecAct(published(), { op: 'undo_drift', key: 'k' }, ctx())).toEqual({ ok: false, reason: 'This change has no decision to take back.' });
		const draft = ok(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'problem', title: 'Current situation', tab: 'spec360' }]);
		expect(applyRetrospecAct(draft, { op: 'undo_drift', key: 'k' }, ctx())).toMatchObject({ ok: false });
	});
});
