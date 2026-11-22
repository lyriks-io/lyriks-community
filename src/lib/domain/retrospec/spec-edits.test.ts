import { describe, expect, it } from 'vitest';
import { applyRetrospecAct, defaultScope, type ActContext } from './acts';
import { currentRun, emptyRetrospecDocument, parseRetrospecDocument, type RetrospecDocument } from './document';
import { codeChangesSince, codeKey, codeValue, type CodeFeatureFacts } from './code-drift';
import { elementStanding } from './spec-validation';
import { handEdited, specEditLines, specEditStatus, specEditsKept, specEditsToReview, type SpecEditChange } from './spec-edits';
import { nextRunReads, runCards } from './run-history';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const bob = { id: 'bob@acme.io', name: 'Bob R.' };
const at = (min: number) => `2026-11-03T10:${String(min).padStart(2, '0')}:00.000Z`;
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

/** A specification whose first run read commit abc1234 and was validated, Ana's validation on two elements. */
function validated(withCommit = true): RetrospecDocument {
	return ok(
		emptyRetrospecDocument(),
		[{ op: 'start', mode: 'repo', baseline: {} }],
		[{ op: 'launch' }],
		...(withCommit ? [[{ op: 'record_commit', sha: 'abc1234def', repository: 'shop' }] as [Parameters<typeof applyRetrospecAct>[1]]] : []),
		[{ op: 'validate', itemId: 'feature:orders', title: 'Orders', tab: 'spec360' }],
		[{ op: 'validate', itemId: 'action:orders:cancel', title: 'Cancel an order', tab: 'spec360' }],
		[{ op: 'publish', baselineId: 'b-1', fingerprints: { 'feature:orders': 'f-orders', 'action:orders:cancel': 'f-cancel' } }, ctx(ana, 5)]
	);
}

const rename = (text: string, implemented = true): SpecEditChange => ({
	itemId: 'action:orders:cancel',
	title: text,
	featureId: 'orders',
	implemented,
	before: { text: 'Cancel an order', desc: 'Stop an order before it ships.' },
	after: { text, desc: 'Stop an order before it ships.' }
});

describe('a hand edit of a validated specification is followed, never refused [criterion:611e98cb]', () => {
	it('keeps the specification validated and opens one line per element, read against the text before the first edit [criterion:68b978c4]', () => {
		let doc = ok(validated(), [{ op: 'edit', itemId: 'action:orders:cancel', title: 'Cancel a paid order', change: rename('Cancel a paid order') }, ctx(ana, 10)]);
		doc = ok(doc, [{ op: 'edit', itemId: 'action:orders:cancel', title: 'Cancel an unpaid order', change: { ...rename('Cancel an unpaid order'), before: { text: 'Cancel a paid order', desc: '' } } }, ctx(bob, 12)]);
		expect(currentRun(doc)?.publishedAt).toBe(at(5));
		const [line] = specEditLines(doc.specEdits);
		expect(line).toMatchObject({ before: { text: 'Cancel an order' }, after: { text: 'Cancel an unpaid order' }, by: bob, at: at(12), firstAt: at(10) });
		expect(specEditStatus(line)).toBe('unchecked');
		expect(specEditsToReview(doc.specEdits)).toBe(1);
	});

	it('refuses an edit of a validated specification that does not say what it read before', () => {
		expect(applyRetrospecAct(validated(), { op: 'edit', itemId: 'feature:orders', title: 'Orders' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('read before') });
	});

	it('closes the line of an element written back to what it read before', () => {
		const doc = ok(validated(), [{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel a paid order') }], [{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel an order') }]);
		expect(doc.specEdits).toBeUndefined();
	});

	it('never lists prose the code cannot confirm as a line to review', () => {
		const doc = ok(validated(), [{ op: 'edit', itemId: 'problem', title: 'Current situation', change: { ...rename('Teams lose orders', false), itemId: 'problem', featureId: null } }]);
		expect(specEditLines(doc.specEdits)).toEqual([]);
		expect(specEditsToReview(doc.specEdits)).toBe(0);
	});
});

describe('a hand edit is cancelled, or decided once the code was read against it', () => {
	const edited = () => ok(validated(), [{ op: 'start', mode: 'repo', baseline: {} }], [{ op: 'launch' }]);
	const withLine = () => ok(validated(), [{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel a paid order') }]);

	it('cancels a line, and refuses to cancel what has none [criterion:0873e142]', () => {
		expect(ok(withLine(), [{ op: 'cancel_spec_edit', itemId: 'action:orders:cancel' }]).specEdits).toBeUndefined();
		expect(applyRetrospecAct(validated(), { op: 'cancel_spec_edit', itemId: 'action:orders:cancel' }, ctx())).toEqual({ ok: false, reason: 'There is no hand edit to cancel on this element.' });
	});

	it('offers no decision before the code was read against the edit [criterion:fea8666f]', () => {
		expect(applyRetrospecAct(withLine(), { op: 'keep_spec_edit', itemId: 'action:orders:cancel' }, ctx())).toEqual({ ok: false, reason: 'Decide once the code was read against the edit.' });
	});

	it('closes a line the code confirms, and keeps one it contradicts until the code follows [criterion:fea8666f]', () => {
		const running = ok(withLine(), [{ op: 'start', mode: 'repo', baseline: {} }], [{ op: 'launch' }]);
		const differs = ok(running, [{ op: 'check_spec_edits', reports: [{ itemId: 'action:orders:cancel', verdict: 'other', code: 'cancel(order)', where: 'src/orders.ts:42' }] }]);
		expect(specEditStatus(specEditLines(differs.specEdits)[0])).toBe('differs');
		const kept = ok(differs, [{ op: 'keep_spec_edit', itemId: 'action:orders:cancel' }, ctx(bob)]);
		expect(specEditStatus(specEditLines(kept.specEdits)[0])).toBe('kept');
		expect(specEditsKept(kept.specEdits)).toBe(1);
		const stillOther = ok(kept, [{ op: 'check_spec_edits', reports: [{ itemId: 'action:orders:cancel', verdict: 'other', code: '', where: '' }] }]);
		expect(specEditStatus(specEditLines(stillOther.specEdits)[0])).toBe('kept');
		const followed = ok(kept, [{ op: 'check_spec_edits', reports: [{ itemId: 'action:orders:cancel', verdict: 'same', code: 'if (order.paid) cancel(order)', where: 'src/orders.ts:42' }] }]);
		expect(specEditStatus(specEditLines(followed.specEdits)[0])).toBe('confirmed');
	});

	it('names back a check on an element with no line, and needs a run under way [criterion:23397c95]', () => {
		expect(applyRetrospecAct(edited(), { op: 'check_spec_edits', reports: [{ itemId: 'feature:nope', verdict: 'same', code: '', where: '' }] }, ctx())).toEqual({ ok: false, reason: 'No hand edit waits on feature:nope.' });
		expect(applyRetrospecAct(withLine(), { op: 'check_spec_edits', reports: [] }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('No Reverse-Specification is under way') });
	});
});

describe('a run records the commit it read [criterion:c50587fb]', () => {
	it('records the commit on the run under way and shows it on its card', () => {
		const doc = validated();
		expect(doc.runs[0].commit).toEqual({ sha: 'abc1234def', repository: 'shop', at: at(0) });
		const [card] = runCards(doc, 'done');
		expect(card.commit).toBe('abc1234');
		expect(card.history.map((s) => s.label)).toContain('Commit abc1234 recorded');
	});

	it('refuses a commit with no run under way, on a documentation run, or that git would not name', () => {
		expect(applyRetrospecAct(validated(), { op: 'record_commit', sha: 'abc1234', repository: null }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('No Reverse-Specification is under way') });
		const docs = ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'docs', baseline: {} }]);
		expect(applyRetrospecAct(docs, { op: 'record_commit', sha: 'abc1234', repository: null }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('documentation alone') });
		const repo = ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }]);
		expect(applyRetrospecAct(repo, { op: 'record_commit', sha: 'main', repository: null }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('as git names it') });
	});

	it('reads back as it was saved', () => {
		const doc = ok(validated(), [{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel a paid order') }]);
		expect(parseRetrospecDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
	});
});

describe('a complementary run reads the delta and sends back to validation only what changed [criterion:0c87480c]', () => {
	it('starts complementary from the commit of the last validated run, carrying its validations', () => {
		expect(nextRunReads(validated(), true)).toEqual({ complementary: true, fromCommit: 'abc1234' });
		const run = currentRun(ok(validated(), [{ op: 'start', mode: 'repo', baseline: {} }]))!;
		expect(run.complementary).toEqual({ fromRunId: 'run-1', fromCommit: 'abc1234def', scope: 'delta' });
		expect(Object.keys(run.carried ?? {})).toEqual(['feature:orders', 'action:orders:cancel']);
		expect(runCards(ok(validated(), [{ op: 'start', mode: 'repo', baseline: {} }]), 'running')[0].complementary).toBe(true);
	});

	it('starts from what is gathered and erases nothing with no commit, from the documentation, or with no validated run [criterion:2dbed801]', () => {
		// No commit recorded: still the delta, from the evidence the specification cites.
		expect(nextRunReads(validated(false), true)).toEqual({ complementary: true, fromCommit: null });
		const noCommit = currentRun(ok(validated(false), [{ op: 'start', mode: 'repo', baseline: {} }]))!;
		expect(noCommit.complementary).toEqual({ fromRunId: 'run-1', fromCommit: null, scope: 'delta' });
		expect(Object.keys(noCommit.carried ?? {})).toEqual(['feature:orders', 'action:orders:cancel']);
		// From the documentation: no git delta, the same carried validations.
		const docs = currentRun(ok(validated(), [{ op: 'start', mode: 'docs', baseline: {} }]))!;
		expect(docs.complementary).toEqual({ fromRunId: 'run-1', fromCommit: null, scope: 'delta' });
		// Choosing the code afterwards reads git's delta again.
		const chosen = ok(validated(), [{ op: 'start', mode: 'docs', baseline: {} }], [{ op: 'choose_mode', mode: 'both' }]);
		expect(currentRun(chosen)?.complementary).toEqual({ fromRunId: 'run-1', fromCommit: 'abc1234def', scope: 'delta' });
		// A specification its AI wrote with no run started here: complementary, nothing to carry.
		const gathered = currentRun(ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'docs', baseline: { documents: 2, features: 4 } }]))!;
		expect(gathered.complementary).toEqual({ fromRunId: null, fromCommit: null, scope: 'delta' });
		expect(nextRunReads(emptyRetrospecDocument(), true)).toEqual({ complementary: true, fromCommit: null });
		// Only a product with nothing gathered yet reads it whole.
		expect(nextRunReads(emptyRetrospecDocument(), false)).toEqual({ complementary: false });
		expect(currentRun(ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }]))?.complementary).toBeUndefined();
	});

	it('carries validations against what the elements read at the start when the last validated run recorded nothing', () => {
		const older = ok(
			emptyRetrospecDocument(),
			[{ op: 'start', mode: 'repo', baseline: {} }],
			[{ op: 'validate', itemId: 'feature:orders', title: 'Orders', tab: 'spec360' }],
			[{ op: 'publish', baselineId: 'b-1' }, ctx(ana, 5)]
		);
		const run = currentRun(ok(older, [{ op: 'start', mode: 'repo', baseline: { features: 3 }, fingerprints: { 'feature:orders': 'f-now' } }]))!;
		expect(run.carried).toEqual({ 'feature:orders': { fingerprint: 'f-now', validatedBy: expect.any(Array) } });
		expect(elementStanding(run, { id: 'feature:orders', title: 'Orders', owner: 'product', fingerprint: 'f-now' }, ana, []).state).toBe('ok');
		expect(elementStanding(run, { id: 'feature:orders', title: 'Orders', owner: 'product', fingerprint: 'f-rewritten' }, ana, []).state).toBe('todo');
	});

	it('keeps a carried validation while the element reads as it did, and asks again once it changed', () => {
		const run = currentRun(ok(validated(), [{ op: 'start', mode: 'repo', baseline: {} }]))!;
		const same = elementStanding(run, { id: 'feature:orders', title: 'Orders', owner: 'product', fingerprint: 'f-orders' }, ana, []);
		const changed = elementStanding(run, { id: 'action:orders:cancel', title: 'Cancel', owner: 'product', fingerprint: 'f-other' }, ana, []);
		expect(same.state).toBe('ok');
		expect(changed.state).toBe('todo');
	});

	it('closes the confirmed lines and lifts the marks once validated, keeping the rest', () => {
		let doc = ok(
			validated(),
			[{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel a paid order') }],
			[{ op: 'edit', itemId: 'feature:orders', title: 'Orders', change: { ...rename('Orders and refunds'), itemId: 'feature:orders', before: { text: 'Orders', desc: '' } } }],
			[{ op: 'edit', itemId: 'problem', title: 'Current situation', change: { ...rename('Teams lose orders', false), itemId: 'problem', featureId: null } }],
			[{ op: 'start', mode: 'repo', baseline: {} }],
			[{ op: 'launch' }],
			[{ op: 'check_spec_edits', reports: [{ itemId: 'action:orders:cancel', verdict: 'same', code: 'if (paid)', where: 'src/orders.ts:42' }] }],
			[{ op: 'start_review', total: 2 }]
		);
		doc = ok(doc, [{ op: 'publish', baselineId: 'b-2', fingerprints: {} }]);
		expect(Object.keys(doc.specEdits ?? {})).toEqual(['feature:orders']);
	});
});

describe('a hand edit never hides the code of the feature [criterion:68b978c4]', () => {
	const validatedRun = { ...validated().runs[0], codeAtValidation: {} as Record<string, string> };
	const facts = (snippet: string): CodeFeatureFacts => ({
		featureId: 'orders',
		featureName: 'Orders',
		syncedAt: at(30),
		specUpdatedAt: at(10),
		elements: [
			{ actionId: 'cancel', kind: 'action', id: 'cancel', name: 'Cancel an order', file: 'src/orders.ts', line: 40, snippet: `cancel ${snippet}` },
			{ actionId: 'ship', kind: 'action', id: 'ship', name: 'Ship an order', file: 'src/orders.ts', line: 80, snippet: `ship ${snippet}` }
		]
	});
	const before = facts('v1');
	const run = { ...validatedRun, codeAtValidation: Object.fromEntries(before.elements.map((e) => [codeKey('orders', e), codeValue(e)])) };

	it('lists the code changes of the other elements of a feature edited by hand, and leaves the edited action to the next run', () => {
		const doc = ok(validated(), [{ op: 'edit', itemId: 'action:orders:cancel', title: 'x', change: rename('Cancel a paid order') }, ctx(ana, 10)]);
		const changes = codeChangesSince(run, [facts('v2')], [], handEdited(doc.specEdits));
		expect(changes.map((c) => c.codeElement.id)).toEqual(['ship']);
	});

	it('still leaves out a feature whose specification moved through Lyriks otherwise', () => {
		expect(codeChangesSince(run, [facts('v2')], [], handEdited(undefined))).toEqual([]);
	});
});

describe('a later run reads what changed or the whole product again, and erases nothing either way [criterion:98612117]', () => {
	it('reads by one rule: Full analysis with nothing gathered, Resume after a run closed short, Delta otherwise [criterion:04f3bc85]', () => {
		expect(defaultScope(validated(), [], true)).toBe('delta');
		// No commit and no stored text: Delta analysis still, reading what is new or changed in what the specification cites.
		expect(defaultScope(validated(false), [], true)).toBe('delta');
		// Nothing gathered yet: the first run reads the whole product.
		expect(defaultScope(emptyRetrospecDocument(), [], false)).toBe('whole');
		// The last run was closed by a person before its AI's final check: it is resumed.
		const closed = ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }], [{ op: 'launch' }], [{ op: 'end_analysis' }]);
		expect(defaultScope(closed, [], true)).toBe('resume');
		expect(defaultScope(closed, [at(9)], true)).toBe('delta');
	});

	it('changes what the run reads until its prompt runs, and only for a run that starts from what is gathered', () => {
		const started = ok(validated(), [{ op: 'start', mode: 'repo', baseline: {}, scope: 'whole' }]);
		expect(currentRun(started)?.complementary?.scope).toBe('whole');
		expect(runCards(started, 'source')[0]).toMatchObject({ whole: true, complementary: false });
		const chosen = ok(started, [{ op: 'choose_scope', scope: 'delta' }]);
		expect(currentRun(chosen)?.complementary?.scope).toBe('delta');
		expect(runCards(chosen, 'source')[0]).toMatchObject({ whole: false, complementary: true });
		const launched = ok(chosen, [{ op: 'launch' }]);
		expect(applyRetrospecAct(launched, { op: 'choose_scope', scope: 'whole' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('before the prompt runs') });
		const first = ok(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }]);
		expect(applyRetrospecAct(first, { op: 'choose_scope', scope: 'delta' }, ctx())).toEqual({ ok: false, reason: expect.stringContaining('nothing gathered') });
		expect(parseRetrospecDocument(JSON.parse(JSON.stringify(started)))).toEqual(started);
	});
});
