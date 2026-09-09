import { describe, expect, it } from 'vitest';
import { applyDecisions, canSettle, reopenGap, settleGap } from './decisions';
import { createEmptyCoherenceDraft, type CoherenceAnalysis, type Gap } from './draft';
import { coherenceScoreOf } from './incoherence';

const gap = (id: string, blocking = false): Gap => ({
	id,
	severity: 'medium',
	title: `Gap ${id}`,
	detail: '',
	sourceStep: 'rules',
	blocking
});
const analysis = (gaps: Gap[]): CoherenceAnalysis => ({ dimensions: [], gaps, readinessScore: 0 });
const person = { id: 'ana@example.com', kind: 'person' as const };

describe('settling a gap', () => {
	it('takes the gap out of the open list and out of the score, and keeps the trace', () => {
		const draft = settleGap(
			createEmptyCoherenceDraft('p'),
			{ gapId: 'g1', gapTitle: 'Gap g1', status: 'accepted_risk', reason: 'Known, cheap', author: person },
			'd1',
			'2026-09-03T10:00:00.000Z'
		);
		const applied = applyDecisions(analysis([gap('g1'), gap('g2')]), draft);
		expect(applied.gaps.map((g) => g.id)).toEqual(['g2']);
		expect(applied.settled?.map((s) => [s.gap.id, s.decision.authorId, s.decision.reason])).toEqual([
			['g1', 'ana@example.com', 'Known, cheap']
		]);
		expect(coherenceScoreOf(applied.gaps)).toBeGreaterThan(coherenceScoreOf([gap('g1'), gap('g2')]));
	});

	it('never settles a blocking gap, even with a standing decision', () => {
		expect(canSettle(gap('b', true), person, 'because')).toEqual({
			ok: false,
			why: 'A blocking gap cannot be settled: fix it at the source.'
		});
		const draft = settleGap(
			createEmptyCoherenceDraft('p'),
			{ gapId: 'b', gapTitle: 'B', status: 'wont_fix', reason: 'x', author: person },
			'd1',
			'2026-09-03T10:00:00.000Z'
		);
		const applied = applyDecisions(analysis([gap('b', true)]), draft);
		expect(applied.gaps.map((g) => g.id)).toEqual(['b']);
		expect(applied.settled ?? []).toEqual([]);
	});

	it('refuses an AI client and an empty reason: a decision belongs to a person with a why', () => {
		expect(canSettle(gap('g'), { kind: 'ai_client' }, 'why').ok).toBe(false);
		expect(canSettle(gap('g'), person, '   ').ok).toBe(false);
		expect(canSettle(undefined, person, 'why').ok).toBe(false);
		expect(canSettle(gap('g'), person, 'why')).toEqual({ ok: true });
	});

	it('reopens by superseding the standing decision, never by deleting it', () => {
		let draft = settleGap(
			createEmptyCoherenceDraft('p'),
			{ gapId: 'g1', gapTitle: 'Gap g1', status: 'accepted_risk', reason: 'ok', author: person },
			'd1',
			'2026-09-03T10:00:00.000Z'
		);
		draft = reopenGap(draft, 'g1', person, 'not ok any more', 'd2', '2026-09-04T10:00:00.000Z');
		expect(draft.decisions.map((d) => [d.id, d.status, d.supersededById])).toEqual([
			['d1', 'accepted_risk', 'd2'],
			['d2', 'reopened', null]
		]);
		const applied = applyDecisions(analysis([gap('g1')]), draft);
		expect(applied.gaps.map((g) => g.id)).toEqual(['g1']);
	});

	it('reads a legacy acknowledgement as settled, and says no reason was recorded', () => {
		const draft = { ...createEmptyCoherenceDraft('p'), acknowledgedGapIds: ['g1'] };
		const applied = applyDecisions(analysis([gap('g1')]), draft);
		expect(applied.gaps).toEqual([]);
		expect(applied.settled?.[0].decision.reason).toMatch(/no reason recorded/);
	});

	it('leaves an analysis untouched when nothing is settled', () => {
		const a = analysis([gap('g1')]);
		expect(applyDecisions(a, createEmptyCoherenceDraft('p'))).toBe(a);
	});
});
