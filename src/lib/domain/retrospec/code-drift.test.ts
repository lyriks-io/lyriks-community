import { describe, expect, it } from 'vitest';
import {
	codeBroughtBy,
	codeChangeHead,
	codeChangesSince,
	codeKey,
	codeReference,
	codeSnapshot,
	sameCode,
	sendBackPrompt,
	type BranchCode,
	type CodeElementFact,
	type CodeFeatureFacts
} from './code-drift';
import type { RetrospecRun } from './document';

const ana = { id: 'ana@acme.io', name: 'Ana P.' };
const T = (h: number) => `2026-10-26T${String(h).padStart(2, '0')}:00:00.000Z`;
const rule: CodeElementFact = { actionId: 'a1', kind: 'rule', id: 'r1', name: 'No order after 6 pm', file: 'src/orders.js', line: 17, snippet: "if (hour >= 18) return refused('Closed');" };
const action: CodeElementFact = { actionId: 'a1', kind: 'action', id: 'a1', name: 'Place an order', file: 'src/orders.js', line: 12, snippet: 'export function placeOrder(order) {' };
const facts = (over: Partial<CodeFeatureFacts> = {}, elements: CodeElementFact[] = [action, rule]): CodeFeatureFacts[] => [
	{ featureId: 'f1', featureName: 'Ordering', syncedAt: T(12), specUpdatedAt: T(8), elements, ...over }
];

const validatedRun = (reference: Record<string, string>, drift: RetrospecRun['drift'] = {}): RetrospecRun => ({
	id: 'run-1',
	mode: 'repo',
	implicit: false,
	startedAt: T(8),
	startedBy: ana,
	baseline: {},
	launchedAt: T(8),
	analysisEndedAt: null,
	analysisEndedBy: null,
	reviewStartedAt: T(9),
	itemTotal: 0,
	publishedAt: T(10),
	publishedBy: ana,
	baselineId: 'b1',
	verdicts: {},
	codeAtValidation: reference,
	drift
});

describe('the code changed outside Lyriks', () => {
	const reference = codeSnapshot(facts());

	it('lists nothing while the code reads as validated, a line shifted by an edit elsewhere included', () => {
		expect(codeChangesSince(validatedRun(reference), facts())).toEqual([]);
		expect(codeChangesSince(validatedRun(reference), facts({}, [action, { ...rule, line: 30 }]))).toEqual([]);
	});

	it('lists a rule whose code changed, linked to the rule, with what the code reads now', () => {
		const changed = { ...rule, snippet: "if (hour >= 20) return refused('Closed');" };
		const [change] = codeChangesSince(validatedRun(reference), facts({}, [action, changed]));
		expect(change).toMatchObject({
			key: codeKey('f1', rule),
			elementId: 'rule:f1:r1',
			elementLabel: 'Rule · No order after 6 pm',
			where: 'src/orders.js:17',
			decision: null
		});
		expect(change.what).toContain('if (hour >= 20)');
	});

	it('lists an element gone from the code, and one that moved to another file read without its signature line', () => {
		const changes = codeChangesSince(validatedRun(reference), facts({}, [{ ...action, file: 'src/checkout.js', snippet: '' }, { ...rule, file: null, line: null, snippet: '' }]));
		expect(changes.map((c) => c.what)).toEqual(['“Place an order” moved from src/orders.js to src/checkout.js.', '“No order after 6 pm” is no longer found in the code.']);
		expect(changes[1].where).toBe('was src/orders.js:17');
	});

	it('leaves out a feature whose specification moved since (the change went through Lyriks) or never synced since', () => {
		const changed: CodeElementFact[] = [action, { ...rule, file: null, line: null, snippet: '' }];
		expect(codeChangesSince(validatedRun(reference), facts({ specUpdatedAt: T(11) }, changed))).toEqual([]);
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(9) }, changed))).toEqual([]);
	});

	it('reads a decision taken on this very code, and a later change as new', () => {
		const gone: CodeElementFact[] = [action, { ...rule, file: null, line: null, snippet: '' }];
		const [change] = codeChangesSince(validatedRun(reference), facts({}, gone));
		const decided = validatedRun(reference, { [change.key]: { decision: 'sent_back', by: ana, at: T(13), code: change.code, baselineId: null } });
		expect(codeChangesSince(decided, facts({}, gone))[0].decision?.decision).toBe('sent_back');
		const moved: CodeElementFact[] = [action, { ...rule, file: 'src/hours.js', snippet: "if (hour >= 19) return refused('Closed');" }];
		expect(codeChangesSince(decided, facts({}, moved))[0].decision).toBeNull();
	});

	it('compares on the signature, else on the line', () => {
		expect(sameCode('a.js\t3\tx', 'a.js\t9\tx')).toBe(true);
		expect(sameCode('a.js\t3\t', 'a.js\t9\tx')).toBe(false);
		expect(sameCode('', '')).toBe(true);
	});

	it('hands the AI the element, the place, what the spec says and the ticket to open through its own tracker', () => {
		const [change] = codeChangesSince(validatedRun(reference), facts({}, [action, { ...rule, file: null, line: null, snippet: '' }]));
		const prompt = sendBackPrompt(change, { name: 'La Fournée', id: 'lf-1' });
		expect(prompt).toContain('“No order after 6 pm”');
		expect(prompt).toContain('was src/orders.js:17');
		expect(prompt).toContain('get_behavior_feature("f1")');
		expect(prompt).toContain('tracker');
	});
});

describe('the code of a request built on its own branch [criterion:ac-leaf-ac-evo-branch-not-outside]', () => {
	const reference = codeSnapshot(facts());
	const fixed: CodeElementFact[] = [action, { ...rule, snippet: "if (hour >= 20) return refused('Closed');" }];
	// The tool syncs the index at 12:00, then reports git's state 12 s later; the branch reported again at 14:00.
	const branch: BranchCode = { from: '2026-10-26T12:00:12.000Z', to: T(14), merged: null };

	it('never lists the code synced from a request branch, open or cancelled: it is that request\'s code', () => {
		expect(codeChangesSince(validatedRun(reference), facts({}, fixed))).toHaveLength(1);
		expect(codeChangesSince(validatedRun(reference), facts({}, fixed), [branch])).toEqual([]);
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(13) }, fixed), [branch])).toEqual([]);
	});

	it('reads a sync made after the branch\'s last report, or long before it began, as the deployment branch\'s code', () => {
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(15) }, fixed), [branch])).toHaveLength(1);
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(11) }, fixed), [branch])).toHaveLength(1);
	});

	it('makes the code a merged branch brought the reference: a later sync of that code lists nothing', () => {
		const brought = codeBroughtBy(branch, reference, facts({}, fixed));
		expect(brought).toEqual({ [codeKey('f1', rule)]: codeSnapshot(facts({}, fixed))[codeKey('f1', rule)] });
		const merged: BranchCode = { ...branch, merged: { at: T(16), code: brought } };
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(17) }, fixed), [merged])).toEqual([]);
		// A change on the deployment branch after the merge is still read against the merged code.
		const hotfix: CodeElementFact[] = [action, { ...rule, snippet: "if (hour >= 22) return refused('Closed');" }];
		expect(codeChangesSince(validatedRun(reference), facts({ syncedAt: T(17) }, hotfix), [merged])).toHaveLength(1);
	});

	it('brings nothing synced before the branch began, and takes a merge that predates the validation for nothing', () => {
		expect(codeBroughtBy(branch, reference, facts({ syncedAt: T(11) }, fixed))).toEqual({});
		const old: BranchCode = { ...branch, merged: { at: T(9), code: { [codeKey('f1', rule)]: 'elsewhere.js\t1\tx' } } };
		expect(codeReference(validatedRun(reference), [old])).toEqual(reference);
	});
});

describe('how a code change heads its card [criterion:4903ceb0]', () => {
	const reference = codeSnapshot(facts());

	it('reads what became of the code: changed, moved to another file, or gone, with what the code reads now', () => {
		const changes = codeChangesSince(
			validatedRun(reference),
			facts({}, [{ ...action, file: 'src/checkout.js', snippet: '' }, { ...rule, snippet: "if (hour >= 20) return refused('Closed');" }])
		);
		expect(changes.map((c) => [c.shift, c.codeElement])).toEqual([
			['moved', { kind: 'action', id: 'a1', name: 'Place an order', actionId: 'a1' }],
			['changed', { kind: 'rule', id: 'r1', name: 'No order after 6 pm', actionId: 'a1' }]
		]);
		expect(changes[1].snippet).toBe("if (hour >= 20) return refused('Closed');");
		const [gone] = codeChangesSince(validatedRun(reference), facts({}, [action, { ...rule, file: null, line: null, snippet: '' }]));
		expect([gone.shift, gone.snippet]).toEqual(['gone', '']);
	});

	it('types it from the element and the shift, and names a rule by the action it guards', () => {
		const head = (kind: string, shift: 'changed' | 'moved' | 'gone', actionName: string | null = null) =>
			codeChangeHead({ codeElement: { kind, id: 'x', name: 'No order after 6 pm', actionId: 'a1' }, shift }, actionName);
		expect(head('rule', 'changed', 'Place an order')).toEqual({ type: 'Rule changed', title: 'A rule of “Place an order” changed in the code' });
		expect(head('rule', 'gone', 'Place an order')).toEqual({ type: 'Rule removed', title: 'A rule of “Place an order” is no longer in the code' });
		expect(head('invariant', 'moved', 'Place an order').title).toBe('An invariant of “Place an order” moved to another file');
		expect(head('rule', 'changed')).toEqual({ type: 'Rule changed', title: 'The code of “No order after 6 pm” changed' });
		expect(head('action', 'gone', 'Place an order')).toEqual({ type: 'Action removed', title: '“No order after 6 pm” is no longer in the code' });
		expect(head('event', 'moved').type).toBe('Event moved');
		expect(head('mystery', 'changed').type).toBe('Element changed');
	});
});

describe('the brief that restores the code [criterion:53e7e3da]', () => {
	const reference = codeSnapshot(facts());

	it('says what to revert, keeps the spec untouched and ends with the index sync that takes the change off the list', () => {
		const [change] = codeChangesSince(validatedRun(reference), facts({}, [action, { ...rule, snippet: "if (hour >= 20) return refused('Closed');" }]));
		const brief = sendBackPrompt({ ...change, specText: 'The system refuses an order placed at 18:00 or later.' }, { name: 'La Fournée', id: 'lf-1' });
		expect(brief.startsWith('Restore the previous behaviour of “No order after 6 pm” in La Fournée (Lyriks project lf-1)')).toBe(true);
		expect(brief).toContain("What the code reads now (to revert): if (hour >= 20) return refused('Closed');.");
		expect(brief).toContain('says: “The system refuses an order placed at 18:00 or later.” Read it with');
		expect(brief).toContain('4. Do not modify the specification.');
		expect(brief).toContain('sync_implementation_index');
	});
});

describe('a code element that only moved to another file asks no decision [criterion:2667bc55]', () => {
	const reference = codeSnapshot(facts());

	it('leaves out an element whose code reads the same signature line in another file', () => {
		expect(codeChangesSince(validatedRun(reference), facts({}, [{ ...action, file: 'src/checkout.js', line: 3 }, rule]))).toEqual([]);
	});

	it('reads a move with another signature line as a change, and one read without a signature line as a move', () => {
		const changed = codeChangesSince(validatedRun(reference), facts({}, [{ ...action, file: 'src/checkout.js', snippet: 'export function placeOrder(order, user) {' }, rule]));
		expect(changed.map((c) => c.shift)).toEqual(['changed']);
		const unread = codeChangesSince(validatedRun(reference), facts({}, [{ ...action, file: 'src/checkout.js', snippet: '' }, rule]));
		expect(unread.map((c) => c.shift)).toEqual(['moved']);
	});

	it('dates each change by the last reading of its feature', () => {
		const [change] = codeChangesSince(validatedRun(reference), facts({}, [action, { ...rule, file: null, line: null, snippet: '' }]));
		expect(change.readAt).toBe(T(12));
	});
});
