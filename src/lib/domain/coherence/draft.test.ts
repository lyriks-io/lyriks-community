import { describe, expect, it } from 'vitest';
import { canGenerateSpecs } from './can-advance';
import {
	computeReadiness,
	coverageScoreOf,
	createEmptyCoherenceDraft,
	isGreen,
	maturityScoreOf,
	openGaps,
	type CoherenceAnalysis,
	type Dimension,
	type Gap,
	type GapDecision
} from './draft';

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

describe('the coverage and maturity scores shown beside readiness', () => {
	it('reads coverage as the rounded average of every dimension but behavior maturity', () => {
		expect(coverageScoreOf([dimension('foundation', 100), dimension('features', 51), dimension('maturity', 0)])).toBe(76);
	});

	it('falls back to the given score when there is no structural dimension, and maturity to its own fallback', () => {
		expect(coverageScoreOf([dimension('maturity', 90)], 42)).toBe(42);
		expect(coverageScoreOf([])).toBe(0);
		expect(maturityScoreOf([dimension('foundation', 100), dimension('maturity', 35)])).toBe(35);
		expect(maturityScoreOf([dimension('foundation', 100)], 7)).toBe(7);
	});
});

const gap = (id: string, blocking = false): Gap => ({ id, severity: 'medium', title: id, detail: '', sourceStep: 'rules', blocking });
const analysis = (readinessScore: number, gaps: Gap[] = []): CoherenceAnalysis => ({ dimensions: [], gaps, readinessScore });
const decision = (gapId: string, overrides: Partial<GapDecision> = {}): GapDecision => ({
	id: `d-${gapId}`,
	gapId,
	status: 'accepted_risk',
	reason: 'Known and owned',
	authorId: 'ana@acme.io',
	authorKind: 'person',
	decidedAt: '2026-11-01T10:00:00.000Z',
	gapTitle: gapId,
	supersededById: null,
	...overrides
});

describe('the green gate before generating the specs', () => {
	it('is green once readiness reaches the threshold with no blocking gap, and only then lets the specs be generated', () => {
		const draft = { ...createEmptyCoherenceDraft('p1'), threshold: 80 };
		expect(isGreen(draft, analysis(80, [gap('minor')]))).toBe(true);
		expect(canGenerateSpecs(draft, analysis(80, [gap('minor')]))).toBe(true);
		expect(isGreen(draft, analysis(79))).toBe(false);
		expect(canGenerateSpecs(draft, analysis(79))).toBe(false);
	});

	it('stays red on a blocking gap whatever the readiness, even one a person decided to accept', () => {
		const draft = { ...createEmptyCoherenceDraft('p1'), threshold: 80, decisions: [decision('broken')] };
		const blocked = analysis(100, [gap('broken', true)]);
		expect(isGreen(draft, blocked)).toBe(false);
		expect(openGaps(draft, blocked).map((g) => g.id)).toEqual(['broken']);
	});
});

describe('the gaps still open', () => {
	it('drops the non-blocking gaps settled by a standing decision or a legacy acknowledgement', () => {
		const draft = { ...createEmptyCoherenceDraft('p1'), acknowledgedGapIds: ['old'], decisions: [decision('owned')] };
		expect(openGaps(draft, analysis(50, [gap('old'), gap('owned'), gap('fresh')])).map((g) => g.id)).toEqual(['fresh']);
	});

	it('keeps a gap open again once its decision is reopened or replaced', () => {
		const draft = {
			...createEmptyCoherenceDraft('p1'),
			decisions: [decision('reopened', { status: 'reopened' }), decision('replaced', { supersededById: 'd-later' })]
		};
		expect(openGaps(draft, analysis(50, [gap('reopened'), gap('replaced')])).map((g) => g.id)).toEqual(['reopened', 'replaced']);
	});
});
