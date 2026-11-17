import { describe, expect, it } from 'vitest';
import { journalChanges, mergeJournal, placeOf, undoJournal, valueAt } from './ai-journal';

/**
 * What the AI wrote for the click it is on, and how a cancellation puts it back
 * (ac-evo-live-cancel): the scenarios of "Cancel the request in progress" and
 * "The AI writes for the click it is on", played on plain documents.
 */

const draft = (over: Record<string, unknown> = {}) => ({
	requests: [
		{
			id: 'r1',
			stepAnswers: { functional_spec: { diagram: 'flow A', failures: 'x.!' } },
			fieldThreads: [{ id: 't1', messages: [{ id: 'm1', body: 'question', privateTo: 'ana' }] }],
			...over
		}
	]
});

describe('the journal of what the AI wrote', () => {
	it('records each place it changed with the value it replaced and the one it left', () => {
		const before = draft();
		const after = draft({ stepAnswers: { functional_spec: { diagram: 'flow B', failures: 'x.!' } } });
		const changes = journalChanges('evolution', before, after);
		expect(changes).toHaveLength(1);
		expect(placeOf(changes[0])).toBe('requests[r1].stepAnswers.functional_spec.diagram');
		expect(changes[0]).toMatchObject({ before: 'flow A', after: 'flow B', existedBefore: true, existsAfter: true });
	});

	it('finds an element by its id, so an added reply is one place', () => {
		const before = draft();
		const after = draft({
			fieldThreads: [{ id: 't1', messages: [{ id: 'm1', body: 'question', privateTo: 'ana' }, { id: 'm2', body: 'answer', replyTo: 'm1' }] }]
		});
		const [added] = journalChanges('evolution', before, after);
		expect(placeOf(added)).toBe('requests[r1].fieldThreads[t1].messages[m2]');
		expect(added).toMatchObject({ existedBefore: false, existsAfter: true, index: 1 });
	});

	it('leaves out what the skip says is bookkeeping', () => {
		const changes = journalChanges('evolution', draft({ aiClicks: [] }), draft({ aiClicks: [{ id: 'c1' }] }), (p) => p[2] === 'aiClicks');
		expect(changes).toEqual([]);
	});

	it('keeps the first value replaced when a place is written twice, and drops a place brought back', () => {
		const one = journalChanges('evolution', draft(), draft({ stepAnswers: { functional_spec: { diagram: 'B', failures: 'x.!' } } }));
		let journal = mergeJournal([], one, {});
		const two = journalChanges(
			'evolution',
			draft({ stepAnswers: { functional_spec: { diagram: 'B', failures: 'x.!' } } }),
			draft({ stepAnswers: { functional_spec: { diagram: 'C', failures: 'x.!' } } })
		);
		journal = mergeJournal(journal, two, {});
		expect(journal).toHaveLength(1);
		expect(journal[0]).toMatchObject({ before: 'flow A', after: 'C' });
		const back = journalChanges(
			'evolution',
			draft({ stepAnswers: { functional_spec: { diagram: 'C', failures: 'x.!' } } }),
			draft()
		);
		expect(mergeJournal(journal, back, {})).toEqual([]);
	});

	it('refreshes an element it added when it changes inside it', () => {
		const withReply = (body: string) =>
			draft({ fieldThreads: [{ id: 't1', messages: [{ id: 'm1', body: 'question', privateTo: 'ana' }, { id: 'm2', body, replyTo: 'm1' }] }] });
		let journal = mergeJournal([], journalChanges('evolution', draft(), withReply('first')), {});
		journal = mergeJournal(journal, journalChanges('evolution', withReply('first'), withReply('second')), { evolution: withReply('second') });
		expect(journal).toHaveLength(1);
		expect((journal[0].after as { body: string }).body).toBe('second');
	});
});

describe('cancelling puts back what the AI wrote', () => {
	it('undoes every place that still holds what the AI left', () => {
		const before = draft();
		const after = draft({
			stepAnswers: { functional_spec: { diagram: 'flow B', failures: 'x.' } },
			fieldThreads: [{ id: 't1', messages: [{ id: 'm1', body: 'question' }, { id: 'm2', body: 'answer', replyTo: 'm1' }] }]
		});
		const journal = mergeJournal([], journalChanges('evolution', before, after), { evolution: after });
		const undo = undoJournal({ evolution: after }, journal);
		expect(undo.kept).toEqual([]);
		expect(undo.roots.evolution).toEqual(before);
	});

	it('keeps, and names, what someone changed since at the same place', () => {
		const before = draft();
		const after = draft({ stepAnswers: { functional_spec: { diagram: 'flow B', failures: 'x.' } } });
		const journal = mergeJournal([], journalChanges('evolution', before, after), { evolution: after });
		const edited = draft({ stepAnswers: { functional_spec: { diagram: 'flow by the person', failures: 'x.' } } });
		const undo = undoJournal({ evolution: edited }, journal);
		expect(undo.kept.map(placeOf)).toEqual(['requests[r1].stepAnswers.functional_spec.diagram']);
		expect(valueAt(undo.roots.evolution, ['requests', { id: 'r1' }, 'stepAnswers', 'functional_spec', 'diagram'])).toEqual({ exists: true, value: 'flow by the person' });
		expect(valueAt(undo.roots.evolution, ['requests', { id: 'r1' }, 'stepAnswers', 'functional_spec', 'failures'])).toEqual({ exists: true, value: 'x.!' });
	});

	it('puts a removed element back where it stood, and removes an added one', () => {
		const before = { sources: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
		const after = { sources: [{ id: 'a' }, { id: 'c' }, { id: 'new' }] };
		const journal = mergeJournal([], journalChanges('documents', before, after), { documents: after });
		expect(undoJournal({ documents: after }, journal).roots.documents).toEqual(before);
	});
});
