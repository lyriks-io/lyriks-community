import { describe, expect, it } from 'vitest';
import { leaveTheStage, takeTheStage } from './one-card';

describe('one hover card at a time [criterion:ac-leaf-ac-src-code-place] [criterion:ac-leaf-ac-glos-underline-only]', () => {
	it('closes the card open before at once when another opens, and never the one opening', () => {
		const closed: string[] = [];
		const a = () => closed.push('a');
		const b = () => closed.push('b');
		takeTheStage(a);
		takeTheStage(a);
		expect(closed).toEqual([]);
		takeTheStage(b);
		expect(closed).toEqual(['a']);
		leaveTheStage(a);
		takeTheStage(a);
		expect(closed).toEqual(['a', 'b']);
		leaveTheStage(a);
	});
});
