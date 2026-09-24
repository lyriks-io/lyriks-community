import { describe, expect, it } from 'vitest';
import { linesOf, listDelta } from './list-delta';

/**
 * What these pin: a proposal that changes two statements out of seventeen is
 * read as two statements, never as seventeen. The wall of text is the defect.
 */

const FIFTEEN = Array.from({ length: 15 }, (_, n) => `Statement ${n + 1}.`).join('\n');

describe('a proposal on a list is read as what it changes', () => {
	it('names what it adds and counts what it keeps', () => {
		const delta = listDelta(FIFTEEN, `${FIFTEEN}\nAn addition never qualifies.\nA self-crossing obeys the gates.`);

		expect(delta.added).toEqual(['An addition never qualifies.', 'A self-crossing obeys the gates.']);
		expect(delta.removed).toEqual([]);
		expect(delta.kept).toHaveLength(15);
		expect(delta.identical).toBe(false);
	});

	it('reads a reworded statement as one removed and one added', () => {
		const delta = listDelta('The gate refuses.\nThe list is paged.', 'The gate refuses with a reason.\nThe list is paged.');

		expect(delta.removed).toEqual(['The gate refuses.']);
		expect(delta.added).toEqual(['The gate refuses with a reason.']);
		expect(delta.kept).toEqual(['The list is paged.']);
	});

	it('says plainly when a proposal changes nothing', () => {
		expect(listDelta(FIFTEEN, FIFTEEN).identical).toBe(true);
	});

	it('treats a first value as all added, with nothing to fold', () => {
		const delta = listDelta('', 'One statement.\nAnother one.');

		expect(delta.added).toHaveLength(2);
		expect(delta.kept).toEqual([]);
		expect(delta.removed).toEqual([]);
	});

	it('drops blank lines and trailing spaces, which are not statements', () => {
		expect(linesOf('  A statement.  \n\n\nAnother.\n')).toEqual(['A statement.', 'Another.']);
	});
});
