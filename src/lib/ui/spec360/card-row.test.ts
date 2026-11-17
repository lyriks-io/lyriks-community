import { describe, expect, it } from 'vitest';
import { columnCount, rowOfIndex } from './card-row';

describe('the row a card keeps when its discussion opens', () => {
	it('is read from its index and the number of columns', () => {
		expect(rowOfIndex(0, 3)).toBe(1);
		expect(rowOfIndex(2, 3)).toBe(1);
		expect(rowOfIndex(3, 3)).toBe(2);
		expect(rowOfIndex(7, 4)).toBe(2);
		expect(rowOfIndex(5, 1)).toBe(6);
		expect(rowOfIndex(4, 0)).toBe(5);
	});

	it('counts the columns of a computed grid template', () => {
		expect(columnCount('280px 280px 280px')).toBe(3);
		expect(columnCount('minmax(0px, 1fr) minmax(0px, 1fr)')).toBe(2);
		expect(columnCount('')).toBe(1);
	});
});
