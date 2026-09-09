import { describe, it, expect } from 'vitest';
import { deriveProjectStage, type StageSignals } from './index';

const signals = (over: Partial<StageSignals> = {}): StageSignals => ({
	coverageScore: 0,
	maturityScore: 0,
	featureCount: 0,
	shippedAt: null,
	lastActivityAt: null,
	...over
});

describe('deriveProjectStage', () => {
	it('reads a freshly created project as ideation', () => {
		expect(deriveProjectStage(signals())).toBe('ideation');
	});

	it('still reads the identity stub the creation modal writes as ideation', () => {
		// A product name (and a one-liner brief) moves coverage a point or two.
		expect(deriveProjectStage(signals({ coverageScore: 1 }))).toBe('ideation');
		expect(deriveProjectStage(signals({ coverageScore: 4 }))).toBe('ideation');
	});

	it('moves to spec in progress once real section work exists', () => {
		expect(deriveProjectStage(signals({ coverageScore: 12 }))).toBe('spec_in_progress');
		expect(deriveProjectStage(signals({ featureCount: 1 }))).toBe('spec_in_progress');
	});

	it('moves to MVP in progress once leaves carry real behavior', () => {
		expect(deriveProjectStage(signals({ coverageScore: 40, maturityScore: 25 }))).toBe(
			'mvp_in_progress'
		);
		expect(deriveProjectStage(signals({ coverageScore: 40, maturityScore: 24 }))).toBe(
			'spec_in_progress'
		);
	});

	it('never reaches a shipped stage on scores alone', () => {
		// Shipping is a human call: a perfect spec is still only an MVP in progress.
		expect(deriveProjectStage(signals({ coverageScore: 100, maturityScore: 100 }))).toBe(
			'mvp_in_progress'
		);
	});

	it('reads the human shipping declaration as V1 shipped', () => {
		expect(
			deriveProjectStage(
				signals({
					coverageScore: 90,
					maturityScore: 80,
					shippedAt: '2026-07-24T10:00:00.000Z',
					lastActivityAt: '2026-07-24T09:00:00.000Z'
				})
			)
		).toBe('v1_shipped');
	});

	it('reads authoring resumed after shipping as V2 in progress', () => {
		expect(
			deriveProjectStage(
				signals({
					coverageScore: 90,
					maturityScore: 80,
					shippedAt: '2026-07-24T10:00:00.000Z',
					lastActivityAt: '2026-07-24T11:00:00.000Z'
				})
			)
		).toBe('v2_in_progress');
	});
});
