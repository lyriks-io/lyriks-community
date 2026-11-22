import { describe, expect, it } from 'vitest';
import { inFocus, type CoherenceFocus } from './focus';

const gap = (id: string, blocking: boolean, severity: 'high' | 'medium' | 'low') => ({
	id,
	blocking,
	severity
});

const list = [gap('a', true, 'medium'), gap('b', false, 'high'), gap('c', false, 'low'), gap('d', true, 'high')];
const fresh = new Set(['c', 'd']);
const kept = (focus: CoherenceFocus) => list.filter((g) => inFocus(g, focus, fresh)).map((g) => g.id);

describe('the headline tiles as lenses', () => {
	it('keeps everything when nothing is pressed', () => {
		expect(kept('all')).toEqual(['a', 'b', 'c', 'd']);
	});

	it('keeps only what each tile counts', () => {
		expect(kept('blocking')).toEqual(['a', 'd']);
		expect(kept('high')).toEqual(['b', 'd']);
		expect(kept('new')).toEqual(['c', 'd']);
	});
});
