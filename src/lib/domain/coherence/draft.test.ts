import { describe, expect, it } from 'vitest';
import { computeReadiness, type Dimension } from './draft';

const dimension = (key: string, score: number): Dimension => ({
	key,
	label: key,
	sourceStep: key,
	score,
	summary: ''
});

describe('computeReadiness', () => {
	it('fails closed when maturity evidence is absent', () => {
		expect(computeReadiness([dimension('foundation', 100), dimension('features', 100)])).toBe(
			40
		);
	});

	it('weights explicit behavior maturity at sixty percent', () => {
		expect(
			computeReadiness([
				dimension('foundation', 100),
				dimension('features', 100),
				dimension('maturity', 50)
			])
		).toBe(70);
	});
});
