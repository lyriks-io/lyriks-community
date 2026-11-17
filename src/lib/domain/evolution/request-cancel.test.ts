import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { cancelRequestAct, deleteRequestAct, postOnFieldAct, reopenRequestAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { canAdvance } from './lifecycle';

/**
 * Cancelling a request along the way, reopening it, deleting it
 * (ac-evo-req-cancel, ac-evo-req-settings): the scenarios of "Cancel the
 * request", "Reopen the request" and "Delete the request".
 */

const ana: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { ...ana, id: 'vi@team.test', role: 'viewer' };
const ai: Actor = { ...ana, kind: 'ai_client', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({
	actor,
	at: '2026-10-25T11:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace: false,
	validators: null
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? 'accepted' : outcome.reason);
const atImpact = (): EvolutionRequest => ({ ...createEvolutionRequest(), stage: 'coherence' });

describe('cancelling a request (ac-evo-req-cancel)', () => {
	it('a person cancels with a reason, at any stage: it keeps its stage and says why', () => {
		const cancelled = ok(cancelRequestAct(ctxFor(ana), atImpact(), 'The payment provider costs more than the baskets bring in.'));
		expect(cancelled.status).toBe('cancelled');
		expect(cancelled.stage).toBe('coherence');
		expect(cancelled.cancellation).toEqual({ reason: 'The payment provider costs more than the baskets bring in.', by: ana.id, at: '2026-10-25T11:00:00.000Z' });
		expect(cancelled.history.at(-1)?.summary).toContain('Request cancelled');
	});

	it('no cancellation without a reason', () => {
		expect(reasonOf(cancelRequestAct(ctxFor(ana), atImpact(), '   '))).toBe('Say why the request is cancelled.');
	});

	it('a viewer cannot cancel, and an AI client does not cancel on its own', () => {
		expect(reasonOf(cancelRequestAct(ctxFor(viewer), atImpact(), 'Not needed.'))).toBe('A viewer cannot cancel an evolution request.');
		expect(reasonOf(cancelRequestAct(ctxFor(ai), atImpact(), 'Looks abandoned.'))).toBe('An AI client cannot cancel a request.');
	});

	it('a closed request is not cancelled', () => {
		const closed: EvolutionRequest = { ...createEvolutionRequest(), stage: 'delivered', status: 'closed' };
		expect(reasonOf(cancelRequestAct(ctxFor(ana), closed, 'Too late.'))).toBe('Only an open request is cancelled.');
	});

	it('a cancelled request is read, not written, and does not move', () => {
		const cancelled = ok(cancelRequestAct(ctxFor(ana), atImpact(), 'Replaced by another request.'));
		expect(reasonOf(postOnFieldAct(ctxFor(ana), cancelled, '00-need.situation', null, 'Still there?'))).toBe('This request is cancelled: reopen it first.');
		const moved = canAdvance(cancelled, 'implementation');
		expect(moved.ok).toBe(false);
		if (!moved.ok) expect(moved.reason).toBe('This request is cancelled: reopen it first.');
	});

	it('its cancellation survives a save and a read', () => {
		const cancelled = ok(cancelRequestAct(ctxFor(ana), atImpact(), 'On hold for the season.'));
		const [read] = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [cancelled] })), 'p').requests;
		expect(read.status).toBe('cancelled');
		expect(read.cancellation?.reason).toBe('On hold for the season.');
	});
});

describe('reopening and deleting (ac-evo-req-cancel, ac-evo-req-settings)', () => {
	it('reopening puts the request back where it stood, without its reason', () => {
		const cancelled = ok(cancelRequestAct(ctxFor(ana), { ...atImpact(), stage: 'implementation' }, 'Too expensive.'));
		const reopened = ok(reopenRequestAct(ctxFor(ana), cancelled));
		expect(reopened.status).toBe('open');
		expect(reopened.stage).toBe('implementation');
		expect(reopened.cancellation).toBeUndefined();
		expect(reopened.history.at(-1)?.summary).toBe('Request reopened');
	});

	it('an open request has nothing to reopen', () => {
		expect(reasonOf(reopenRequestAct(ctxFor(ana), atImpact()))).toBe('Only a cancelled request is reopened.');
	});

	it('a cancelled request can be deleted, by a person only', () => {
		const cancelled = ok(cancelRequestAct(ctxFor(ana), atImpact(), 'Opened by mistake.'));
		expect(reasonOf(deleteRequestAct(ctxFor(viewer), cancelled))).toBe('A viewer cannot delete an evolution request.');
		expect(deleteRequestAct(ctxFor(ai), cancelled).ok).toBe(false);
		expect(ok(deleteRequestAct(ctxFor(ana), cancelled)).status).toBe('deleted');
	});
});
