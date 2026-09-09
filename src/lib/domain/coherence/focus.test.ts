import { describe, expect, it } from 'vitest';
import { FOCUS_META, focusList, inFocus } from './focus';

const gap = (id: string, blocking: boolean, severity: 'high' | 'medium' | 'low') => ({
	id,
	blocking,
	severity
});

const list = [
	gap('a', true, 'medium'),
	gap('b', false, 'high'),
	gap('c', false, 'low'),
	gap('d', true, 'high')
];
const fresh = new Set(['c', 'd']);

describe('the headline tiles as lenses', () => {
	it('keeps everything when nothing is pressed', () => {
		expect(focusList(list, 'all', fresh).map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('keeps only what each tile counts, in the incoming order', () => {
		expect(focusList(list, 'blocking', fresh).map((g) => g.id)).toEqual(['a', 'd']);
		expect(focusList(list, 'high', fresh).map((g) => g.id)).toEqual(['b', 'd']);
		expect(focusList(list, 'new', fresh).map((g) => g.id)).toEqual(['c', 'd']);
	});

	it('answers per item the same way the list does', () => {
		expect(inFocus(gap('x', false, 'low'), 'blocking', fresh)).toBe(false);
		expect(inFocus(gap('x', false, 'low'), 'all', fresh)).toBe(true);
		expect(inFocus(gap('c', false, 'low'), 'new', fresh)).toBe(true);
	});

	it('says what each set means so the tile reads without being pressed', () => {
		expect(FOCUS_META.blocking.means).toMatch(/cannot be settled/);
		expect(FOCUS_META.high.means).toMatch(/score/);
		expect(FOCUS_META.new.means).toMatch(/last visit/);
	});
});
