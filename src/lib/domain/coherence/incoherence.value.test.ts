import { describe, expect, it } from 'vitest';
import type { Gap } from './draft';
import { coherenceScoreOf, effectivePenalties, penaltyOf } from './incoherence';
import { coherenceHeadline } from './headline';

// Criteria e7a2e177, 80c7447d and 2777eeed of feat-health-scores (lyriks-feb747).
const gap = (over: Partial<Gap> & Pick<Gap, 'id'>): Gap => ({ severity: 'high', title: over.id, detail: '', sourceStep: 'features', blocking: false, ...over });

describe('one cause weighs once', () => {
	it('charges a rule broken in six features once, at its heaviest', () => {
		const six = Array.from({ length: 6 }, (_, i) => gap({ id: `unspa-proven-${i}`, provenance: 'behavior', cause: 'rule:link-address', severity: i === 2 ? 'high' : 'medium' }));
		expect(effectivePenalties(six)).toEqual([0, 0, 20, 0, 0, 0]);
		expect(coherenceScoreOf(six)).toBe(coherenceScoreOf([six[2]]));
	});

	it('charges nothing for the consequences of a cause already counted', () => {
		const consequence = gap({ id: 'unspa-verify-0', provenance: 'behavior', weighs: 'consequence' });
		expect(penaltyOf(consequence)).toBe(0);
	});
});

describe('what could not be checked', () => {
	it('is listed and free', () => {
		const notReached = gap({ id: 'unspa-proven-9', provenance: 'behavior', severity: 'medium', weighs: 'unverified' });
		expect(penaltyOf(notReached)).toBe(0);
		expect(coherenceScoreOf([notReached])).toBe(100);
		expect(coherenceHeadline([notReached]).total).toBe(1);
		expect(coherenceHeadline([notReached]).weighsMost).toEqual([]);
	});
});

describe('a product defect, a spec gap, a question, hygiene', () => {
	const defect = gap({ id: 'gap-rules-issue-missing-ban', checkId: 'rules.open-issues', provenance: 'declared', nature: 'defect', severity: 'medium', sourceStep: 'rules' });
	const question = gap({ id: 'gap-rules-issue-ambiguity-domain', checkId: 'rules.open-issues', provenance: 'declared', nature: 'question', severity: 'medium', sourceStep: 'rules' });
	const hygiene = gap({ id: 'gap-glossary-unapproved-terms', checkId: 'glossary.approved', severity: 'low', sourceStep: 'glossary' });
	const detected = { ...defect, provenance: 'detected' as const };

	it('weigh in that order, a declared defect still under the same one detected', () => {
		expect(penaltyOf(defect)).toBe(7);
		expect(penaltyOf(question)).toBe(4);
		expect(penaltyOf(hygiene)).toBe(4);
		expect(penaltyOf(defect)).toBeGreaterThan(penaltyOf(question));
		expect(penaltyOf(defect)).toBeLessThan(penaltyOf(detected));
	});

	it('reads a declared item with no nature as a question, as before', () => {
		expect(penaltyOf({ ...defect, nature: undefined })).toBe(4);
	});
});
