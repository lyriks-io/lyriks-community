import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, type DraftLeaf, type EvolutionRequest } from './draft';
import {
	acceptConflictRiskAct,
	beforeItsTurn,
	beforeItsTurnGate,
	concurrentGate,
	concurrentHoldOf,
	landingOrderOf,
	noticeOtherLanding,
	orderAtFreeze,
	readAgainDue,
	readAgainOf,
	setLandingOrderAct,
	withoutFinishedOrders
} from './landing-order';

const AT = '2026-11-22T10:00:00.000Z';
const ctx = { actor: { id: 'ana@example.test', kind: 'person' as const, role: 'member' as const }, at: AT, newId: () => crypto.randomUUID() };

function underWay(id: string, kind: DraftLeaf['kind'], feature = 'feat-1', extra: Partial<EvolutionRequest> = {}): EvolutionRequest {
	return createEvolutionRequest({
		id,
		title: id,
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		frozen: true,
		leafIds: [feature],
		drafts: [createDraftLeaf({ id: `draft:${id}`, kind, baseLeafId: feature })],
		...extra
	});
}

describe('the order of overlapping requests', () => {
	it('sets a freezing request after the overlapping ones frozen before it, and after no other', () => {
		const frozen = underWay('a', 'amend');
		const notFrozen = underWay('b', 'amend', 'feat-1', { stage: 'coherence', specVersion: 0, frozen: false });
		const elsewhere = underWay('c', 'amend', 'feat-2');
		const here = underWay('here', 'amend', 'feat-1', { stage: 'coherence', specVersion: 0 });
		const ordered = orderAtFreeze(here, [here, frozen, notFrozen, elsewhere]);
		expect(ordered.request.landsAfter).toEqual(['a']);
		expect(landingOrderOf(ordered.request, frozen)).toBe('before');
		expect(landingOrderOf(frozen, ordered.request)).toBe('after');
	});

	it('never orders twice a pair already ordered either way', () => {
		const first = underWay('a', 'amend', 'feat-1', { landsAfter: ['here'] });
		const here = underWay('here', 'amend');
		expect(orderAtFreeze(here, [here, first]).after).toEqual([]);
	});

	it('swaps an order and records the decision on both requests', () => {
		const a = underWay('a', 'amend');
		const b = underWay('b', 'amend', 'feat-1', { landsAfter: ['a'] });
		const done = setLandingOrderAct(ctx, a, b, 'other', [a, b]);
		expect(done.ok).toBe(true);
		if (!done.ok) return;
		const [first, second] = done.requests;
		expect(first.id).toBe('b');
		expect(landingOrderOf(second, first)).toBe('before');
		expect(first.pairDecisions?.[0]).toMatchObject({ requestId: 'a', kind: 'order' });
		expect(second.pairDecisions?.[0]).toMatchObject({ requestId: 'b', kind: 'order' });
	});

	it('refuses a reader, a pair that shares nothing and a request that left the run', () => {
		const a = underWay('a', 'amend');
		const b = underWay('b', 'amend');
		const viewer = { ...ctx, actor: { ...ctx.actor, role: 'viewer' as const } };
		expect(setLandingOrderAct(viewer, a, b, 'this', [a, b])).toMatchObject({ ok: false, reason: 'forbidden' });
		const far = underWay('far', 'amend', 'feat-9');
		expect(setLandingOrderAct(ctx, a, far, 'this', [a, far])).toMatchObject({ ok: false, reason: 'These requests share no feature or table: they are not ordered.' });
		const gone = { ...b, status: 'cancelled' as const };
		expect(setLandingOrderAct(ctx, a, gone, 'this', [a, gone])).toMatchObject({ ok: false, reason: 'Only a request under way is ordered.' });
	});
});

describe('a conflict between two requests under way', () => {
	const amends = underWay('a', 'amend', 'feat-1', { stage: 'coherence', specVersion: 0 });
	const removes = underWay('b', 'remove');

	it('holds the freeze until a person decides it', () => {
		const hold = concurrentHoldOf(amends, [amends, removes]);
		expect(hold.undecided.map((u) => u.key)).toEqual(['EVO-002']);
		expect(concurrentGate(hold)).toMatchObject({ ok: false, reason: 'A conflict with EVO-002 is undecided: set which lands first, or accept the risk with a reason.' });
	});

	it('is decided by an order a person set, never by the order a freeze set', () => {
		const autoOrdered = { ...amends, landsAfter: ['b'] };
		expect(concurrentHoldOf(autoOrdered, [autoOrdered, removes]).undecided).toHaveLength(1);
		const set = setLandingOrderAct(ctx, amends, removes, 'this', [amends, removes]);
		if (!set.ok) throw new Error(set.reason);
		expect(concurrentHoldOf(set.requests[0], set.requests).undecided).toEqual([]);
	});

	it('is accepted as a risk only with a reason, and only a conflict is', () => {
		expect(acceptConflictRiskAct(ctx, amends, removes, '', [amends, removes])).toMatchObject({ ok: false, reason: 'Accepting a risk needs a stated reason.' });
		const overlap = underWay('c', 'amend');
		expect(acceptConflictRiskAct(ctx, amends, overlap, 'why', [amends, overlap])).toMatchObject({ ok: false, reason: 'Only a conflict between two requests is accepted as a risk.' });
		const ai = { ...ctx, actor: { ...ctx.actor, kind: 'ai_client' as const } };
		expect(acceptConflictRiskAct(ai, amends, removes, 'why', [amends, removes])).toMatchObject({ ok: false, reason: 'An AI client cannot accept a risk on behalf of the team.' });
		const accepted = acceptConflictRiskAct(ctx, amends, removes, 'The removal waits for it.', [amends, removes]);
		if (!accepted.ok) throw new Error(accepted.reason);
		expect(concurrentHoldOf(accepted.requests[0], accepted.requests).undecided).toEqual([]);
	});
});

describe('landing in turn', () => {
	it('names the requests set before that have not landed, and asks a reason only then', () => {
		const ahead = underWay('a', 'amend');
		const landed = underWay('l', 'amend', 'feat-1', { status: 'closed' });
		const here = underWay('here', 'amend', 'feat-1', { landsAfter: ['a', 'l'] });
		const requests = [ahead, landed, here];
		expect(beforeItsTurn(here, requests).map((r) => r.id)).toEqual(['a']);
		expect(beforeItsTurnGate(beforeItsTurn(here, requests), requests, '')).toMatchObject({ ok: false, reason: 'EVO-001 lands before this one: say why you declare it live first.' });
		expect(beforeItsTurnGate(beforeItsTurn(here, requests), requests, 'Postponed.').ok).toBe(true);
	});

	it('takes a request that left the run out of every order it was in', () => {
		const gone = underWay('a', 'amend', 'feat-1', { status: 'deleted', landsAfter: ['b'] });
		const b = underWay('b', 'amend', 'feat-1', { pairDecisions: [{ requestId: 'a', kind: 'order', reason: '', by: 'x', at: AT }] });
		const here = underWay('here', 'amend', 'feat-1', { landsAfter: ['a', 'b'] });
		const untouched = underWay('u', 'amend', 'feat-2');
		const [g, kept, mine, same] = withoutFinishedOrders([gone, b, here, untouched]);
		expect(g.landsAfter).toEqual([]);
		expect(kept.pairDecisions).toEqual([]);
		expect(mine.landsAfter).toEqual(['b']);
		expect(same).toBe(untouched);
	});
});

describe('another request landed', () => {
	const read = { status: 'ready' as const, hypothesis: 'change' as const, depth: 2, ranAt: '2026-11-22T09:00:00.000Z' };
	const coherence = { status: 'ready' as const, projectScore: 80, requestDelta: 0, ranAt: '2026-11-22T09:00:00.000Z' };

	it('tells the requests under way that share something, and no other', () => {
		const landed = underWay('landed', 'amend', 'feat-1', { status: 'closed' });
		const sharing = underWay('s', 'amend', 'feat-1', { impactReport: read, coherenceReport: coherence });
		const far = underWay('f', 'amend', 'feat-2');
		const cancelled = underWay('c', 'amend', 'feat-1', { status: 'cancelled' });
		const told = noticeOtherLanding(ctx, landed, [landed, sharing, far, cancelled], (_kind, id) => (id === 'feat-1' ? 'Checkout' : id));
		expect(told.map((r) => r.id)).toEqual(['s']);
		expect(told[0].otherLandings?.[0]).toMatchObject({ requestId: 'landed', key: 'EVO-001', featureIds: ['feat-1'], at: AT });
		expect(told[0].history.at(-1)?.summary).toBe('EVO-001 landed on Checkout: read again on the new version');
		expect(readAgainDue(told[0])).toBe(true);
		expect(readAgainOf(told[0])[0]).toMatchObject({ upToDate: false, neverRead: false });
	});

	it('reads nothing again for a request whose readings never ran, and reads it up to date once they ran after', () => {
		const landing = { requestId: 'l', key: 'EVO-001', title: 'l', featureIds: ['feat-1'], tableIds: [], at: AT };
		const never = underWay('n', 'amend', 'feat-1', { otherLandings: [landing] });
		expect(readAgainDue(never)).toBe(false);
		expect(readAgainOf(never)[0].neverRead).toBe(true);
		const after = { ...read, ranAt: '2026-11-22T11:00:00.000Z' };
		const caughtUp = underWay('u', 'amend', 'feat-1', { otherLandings: [landing], impactReport: after, coherenceReport: { ...coherence, ranAt: after.ranAt } });
		expect(readAgainOf(caughtUp)[0].upToDate).toBe(true);
		expect(readAgainDue(caughtUp)).toBe(false);
	});
});
