import { describe, expect, it } from 'vitest';
import { openRequestAct, PARTIAL_READING_KEPT, runCoherenceAct, type ActContext, type ActOutcome } from './acts';
import { mapCoherenceAnalysis } from './coherence-mapping';
import type { Actor, EvolutionRequest } from './draft';

/**
 * The same request gives the same reading whatever asked for it: a reading
 * taken while the behaviour verification had not answered (a cold cache) never
 * moves the score, the delta or what the product already carried. Seen on Kutt
 * EVO-001 on 2026-10-28: 91/100 with 48 inherited, then 93/100 with 19 right
 * after a server reload, then 91 and 48 again, for the same content.
 */

const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
let counter = 0;
const ctx: ActContext = { actor: client, at: '2026-10-28T12:00:00.000Z', newId: () => `id-${++counter}` };
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const opened = (): EvolutionRequest =>
	ok(openRequestAct({ ...ctx, actor: { ...client, kind: 'person', channel: 'page' } }, { title: 'Fix', origin: 'technical_debt', requester: '', leafIds: ['feat-cart'], knownLeafIds: new Set(['feat-cart']) }));
const gap = (id: string) => ({ id, title: `Gap ${id}`, blocking: false, featureRef: 'feat-cart' });
/** The analysis with the behaviour verification folded in (warm), and without it (cold). */
const warm = { readinessScore: 91, gaps: [gap('g1'), gap('g2'), gap('g3')] };
const cold = { readinessScore: 93, gaps: [gap('g1')] };

const read = (request: EvolutionRequest, analysis: typeof warm, partial = false) =>
	runCoherenceAct(ctx, request, mapCoherenceAnalysis({ request, analysis, leafNames: { 'feat-cart': 'Cart' }, at: ctx.at, partial }), { partial });

describe('the same request gives the same reading whatever asked for it [criterion:ac-leaf-ac-evo-coh-same-reading]', () => {
	it('keeps the reading a request holds when the behaviour verification has not answered', () => {
		const first = ok(read(opened(), warm));
		const again = read(first, cold, true);
		expect(again.ok && again.summary).toBe(PARTIAL_READING_KEPT);
		const kept = ok(again);
		expect(kept.coherenceReport).toEqual(first.coherenceReport);
		expect(kept.coherenceFindings).toEqual(first.coherenceFindings);
		expect(kept.coherenceBaseline).toEqual(first.coherenceBaseline);
	});

	it('gives the same score, delta and counts to two complete readings of the same request', () => {
		const first = ok(read(opened(), warm));
		const a = read(first, warm);
		const b = read(ok(a), warm);
		const summary = (o: ActOutcome) => (o.ok ? o.summary : o.reason);
		expect(summary(a)).toBe('Coherence 91/100 (+0): 0 blocking, 0 informative, 3 already in the product before this request');
		expect(summary(b)).toBe(summary(a));
	});

	it('takes no baseline from a partial first reading, so the next complete one takes it', () => {
		const partial = ok(read(opened(), cold, true));
		expect(partial.coherenceBaseline ?? null).toBeNull();
		const complete = ok(read(partial, warm));
		expect(complete.coherenceBaseline).toHaveLength(3);
		expect(complete.coherenceFindings.filter((f) => f.scope === 'inherited')).toHaveLength(3);
	});

	it('says a partial first reading is partial', () => {
		const outcome = read(opened(), cold, true);
		expect(outcome.ok && outcome.summary).toMatch(/Partial: the behaviour verification is still running/);
	});
});
