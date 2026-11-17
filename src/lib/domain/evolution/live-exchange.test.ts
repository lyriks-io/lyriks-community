import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { postOnFieldAct, type ActContext, type ActOutcome } from './acts';
import { journalChanges } from './ai-journal';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { latestThread } from './field-thread';
import { publishExchange, requestSeenBy, waitingQuestionOf } from './live-exchange';
import {
	aiMayAct,
	cancellableClick,
	CANCELLED_FOR_AI,
	closeTurn,
	currentClickOf,
	journalOnCurrentClick,
	markCancelled,
	openSessionOf,
	takeNextClick
} from './live-session';
import { publishExchangeAct, sendClickAct, startSessionAct } from './live-session-acts';

/**
 * The session with one's AI after the owner's feedback of 2026-10-25: a request
 * in progress can be cancelled and is undone (ac-evo-live-cancel), an exchange
 * stays between the person and their AI until it is published (ac-evo-live-ask),
 * and a question of the AI waits for its answer where it was asked
 * (ac-evo-live-scope).
 */

const ana: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const bo: Actor = { id: 'bo@team.test', kind: 'person', role: 'member', channel: 'page' };
const ai: Actor = { id: 'ana@team.test', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
let minute = 0;
const ctxFor = (actor: Actor): ActContext => ({
	actor,
	at: `2026-10-25T10:${String(++minute).padStart(2, '0')}:00.000Z`,
	newId: () => `id-${++counter}`,
	soloWorkspace: false,
	validators: null
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};

/** Ana opens a session and asks her AI on the Situation; the AI takes the click. */
function asked(): { request: EvolutionRequest; messageId: string } {
	const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
	const posted = ok(sendClickAct(ctxFor(ana), opened, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'Is anything missing?' }));
	const taken = takeNextClick(posted, ana.id, ctxFor(ai).at)!;
	return { request: taken.request, messageId: taken.click.messageId! };
}

describe('an exchange with one\'s AI stays private (ac-evo-live-ask)', () => {
	it('the question and the AI\'s reply are read by the person only', () => {
		const { request, messageId } = asked();
		const replied = ok(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'Two objectives are missing.', messageId));
		expect(latestThread(replied, '00-need.situation')?.messages.every((m) => m.privateTo === ana.id)).toBe(true);
		expect(latestThread(requestSeenBy(replied, ana.id), '00-need.situation')?.messages).toHaveLength(2);
		expect(latestThread(requestSeenBy(replied, bo.id), '00-need.situation')).toBeUndefined();
	});

	it('another member cannot answer a message they cannot read', () => {
		const { request, messageId } = asked();
		const outcome = postOnFieldAct(ctxFor(bo), request, '00-need.situation', null, 'I agree.', messageId);
		expect(outcome.ok).toBe(false);
	});

	it('Make it a comment publishes the whole exchange, and only its owner does', () => {
		const { request, messageId } = asked();
		const replied = ok(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'Two objectives are missing.', messageId));
		expect(publishExchangeAct(ctxFor(bo), replied, messageId).ok).toBe(false);
		expect(publishExchangeAct(ctxFor(ai), replied, messageId).ok).toBe(false);
		const published = ok(publishExchangeAct(ctxFor(ana), replied, messageId));
		expect(latestThread(requestSeenBy(published, bo.id), '00-need.situation')?.messages).toHaveLength(2);
		expect(publishExchange(published, ana.id, messageId).ok).toBe(false);
	});

	it('the privacy and the waiting question survive a save and a read', () => {
		const { request, messageId } = asked();
		const replied = ok(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'Shall I add them?', messageId, { asks: true }));
		const [read] = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [replied] })), 'p').requests;
		const messages = latestThread(read, '00-need.situation')!.messages;
		expect(messages.map((m) => m.privateTo)).toEqual([ana.id, ana.id]);
		expect(messages[1].awaitsAnswer).toBe(true);
	});
});

describe('the AI\'s question waits for its answer where it was asked (ac-evo-live-scope)', () => {
	it('a reply that asks waits until the person answers in the same conversation', () => {
		const { request, messageId } = asked();
		const replied = ok(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'Shall I add them?', messageId, { asks: true }));
		const question = latestThread(replied, '00-need.situation')!.messages[1];
		expect(waitingQuestionOf(latestThread(replied, '00-need.situation')!.messages, ana.id)?.id).toBe(question.id);
		// "ou stp" posted as a new topic does not answer it.
		const elsewhere = ok(postOnFieldAct(ctxFor(ana), replied, '00-need.situation', null, 'ou stp'));
		expect(waitingQuestionOf(latestThread(elsewhere, '00-need.situation')!.messages, ana.id)?.id).toBe(question.id);
		const answered = ok(postOnFieldAct(ctxFor(ana), elsewhere, '00-need.situation', null, 'oui stp', messageId));
		expect(waitingQuestionOf(latestThread(answered, '00-need.situation')!.messages, ana.id)).toBeNull();
	});

	it('only an AI marks a reply as waiting', () => {
		const { request, messageId } = asked();
		const byPerson = ok(postOnFieldAct(ctxFor(ana), request, '00-need.situation', null, 'And you?', messageId, { asks: true }));
		expect(latestThread(byPerson, '00-need.situation')!.messages[1].awaitsAnswer).toBeUndefined();
	});
});

describe('cancelling the request in progress (ac-evo-live-cancel)', () => {
	it('the AI is on the click from taking it until it calls again', () => {
		const { request } = asked();
		const click = currentClickOf(request, ana.id);
		expect(click?.state).toBe('taken');
		expect(openSessionOf(request, ana.id)?.currentClickId).toBe(click?.id);
		const closed = closeTurn(request, ana.id, ctxFor(ai).at)!;
		expect(currentClickOf(closed.request, ana.id)).toBeNull();
		expect(cancellableClick(closed.request, ana.id).ok).toBe(false);
	});

	it('what the AI wrote is journaled on the click, and the person may cancel it', () => {
		const { request, messageId } = asked();
		const replied = ok(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'An answer.', messageId));
		const changes = journalChanges('evolution', { requests: [request] }, { requests: [replied] }, (p) => p[2] === 'aiClicks' || p[2] === 'liveSessions');
		const journaled = journalOnCurrentClick(replied, ana.id, changes, { evolution: { requests: [replied] } });
		const cancellable = cancellableClick(journaled, ana.id);
		expect(cancellable.ok).toBe(true);
		if (cancellable.ok) expect(cancellable.journal).toHaveLength(1);
		expect(cancellableClick(journaled, bo.id).ok).toBe(false);
	});

	it('a cancelled click refuses the AI until it calls again, and that call hears of it', () => {
		const { request } = asked();
		const click = currentClickOf(request, ana.id)!;
		const cancelled = markCancelled(request, ana.id, click.id, { at: ctxFor(ana).at, undone: 2, kept: [] });
		expect(cancelled.aiClicks.find((c) => c.id === click.id)?.state).toBe('cancelled');
		const refused = aiMayAct(cancelled, ana.id);
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toBe(CANCELLED_FOR_AI);
		const turn = closeTurn(cancelled, ana.id, ctxFor(ai).at)!;
		expect(turn.cancelled?.cancellation?.undone).toBe(2);
		expect(aiMayAct(turn.request, ana.id).ok).toBe(true);
	});
});
