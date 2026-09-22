import { describe, expect, it } from 'vitest';
import { coherenceScoreOf, penaltyOf } from './incoherence';
import type { Gap, GapProvenance } from './draft';
import type { GapSeverity } from './enums';

/**
 * The reading must never reward silence.
 *
 * Field case behind these tests: a retro-spec of get.lyriks.io authored twelve
 * true findings into the register (three figures the repo does not state, a
 * retention nobody set, a missing guard, two modelling decisions awaiting a
 * signature, four already settled, an edge the product decided on purpose) and
 * the panel answered COHERENCE 59, "Critical", on a spec with zero blocking and
 * zero high-severity items. The same spec with an empty register would have read
 * 100. That is the incentive this weighting removes.
 */
const gap = (id: string, severity: GapSeverity, provenance: GapProvenance): Gap => ({
	id,
	severity,
	title: id,
	detail: '',
	sourceStep: 'rules',
	blocking: false,
	provenance
});

describe('what an incoherence costs depends on who says so', () => {
	it('charges a declared finding less than a detection of the same severity', () => {
		const declared = penaltyOf(gap('declared-1', 'medium', 'declared'));
		const detected = penaltyOf(gap('detected-1', 'medium', 'detected'));
		expect(declared).toBeLessThan(detected);
	});

	it('charges every machine tier like a detection, because a check ran', () => {
		const detected = penaltyOf(gap('a', 'high', 'detected'));
		for (const p of ['proven', 'reviewed', 'behavior'] as const) {
			expect(penaltyOf(gap('a', 'high', p))).toBe(detected);
		}
	});

	it('still charges a declaration: an open question is real debt', () => {
		expect(penaltyOf(gap('declared-1', 'high', 'declared'))).toBeGreaterThan(0);
	});

	it('keeps a spec that names its problems ahead of one that hides them', () => {
		// The same product, modelled twice: one author writes six findings down,
		// the other writes none and leaves the same six problems in the spec,
		// where the checker eventually finds them.
		const named = Array.from({ length: 6 }, (_, i) => gap(`named-${i}`, 'medium', 'declared'));
		const hidden = Array.from({ length: 6 }, (_, i) => gap(`hidden-${i}`, 'medium', 'detected'));
		expect(coherenceScoreOf(named)).toBeGreaterThan(coherenceScoreOf(hidden));
	});

	it('lifts the field case out of the range the panel calls critical', () => {
		const declaredLows = Array.from({ length: 9 }, (_, i) => gap(`d-low-${i}`, 'low', 'declared'));
		const declaredMediums = Array.from({ length: 2 }, (_, i) => gap(`d-med-${i}`, 'medium', 'declared'));
		const detected = [gap('x-low', 'low', 'detected'), gap('x-med', 'medium', 'detected')];
		const score = coherenceScoreOf([...declaredLows, ...declaredMediums, ...detected]);
		expect(score).toBe(73);
		expect(score).toBeGreaterThanOrEqual(34);
	});

	it('leaves a clean spec at 100', () => {
		expect(coherenceScoreOf([])).toBe(100);
	});
});
