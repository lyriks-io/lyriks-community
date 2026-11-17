import { describe, expect, it } from 'vitest';
import { dismissalOf } from './notice';

describe("a notification's level says how urgent it is, and whether it is put aside with Got it or Later [criterion:e190404f]", () => {
	it('puts information aside with Got it, what is left to do with Later', () => {
		expect((['info', 'match', 'certified'] as const).map(dismissalOf)).toEqual(['Got it', 'Got it', 'Got it']);
		expect((['action', 'drift', 'critical', 'missing'] as const).map(dismissalOf)).toEqual(['Later', 'Later', 'Later', 'Later']);
	});
});
