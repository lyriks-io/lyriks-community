import { describe, expect, it } from 'vitest';
import type { ActContext, ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { latestThread } from './field-thread';
import { answerOf, endSessionAct, recordAnswerAct, sendClickAct, startSessionAct, withdrawClickAct } from './live-session-acts';
import { openSessionOf, pendingClicksOf, takeNextClick } from './live-session';

/**
 * Who may do what in a live session (ac-evo-live-guards): the AI opens and
 * answers, the person clicks, either one ends it; Ask posts its message in the
 * thread and the AI's reply to it answers the click (ac-evo-live-ask).
 */

const person: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { ...person, role: 'viewer' };
const ai: Actor = { id: 'ana@team.test', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({
	actor,
	at: '2026-10-25T10:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace: true,
	validators: null
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};

describe('the acts of a live session', () => {
	it('the AI opens a session, a person does not', () => {
		expect(startSessionAct(ctxFor(person), createEvolutionRequest()).ok).toBe(false);
		const request = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		expect(openSessionOf(request, person.id)).not.toBeNull();
	});

	it('Ask my AI posts the message in the thread, and the click carries it', () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const asked = ok(sendClickAct(ctxFor(person), opened, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'What is missing here?' }));
		const thread = latestThread(asked, '00-need.situation');
		expect(thread?.messages.map((m) => m.body)).toEqual(['What is missing here?']);
		const [click] = pendingClicksOf(asked, person.id);
		expect(click.messageId).toBe(thread?.messages[0].id);
	});

	it('an ask with no session waits for the session the copied prompt opens, which takes it first [criterion:ac-leaf-ac-evo-live-no-session]', () => {
		const asked = ok(sendClickAct(ctxFor(person), createEvolutionRequest(), { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'Hello?' }));
		const [click] = pendingClicksOf(asked, person.id);
		expect(click).toMatchObject({ kind: 'ask', state: 'waiting' });
		expect(latestThread(asked, '00-need.situation')?.messages.at(-1)).toMatchObject({ body: 'Hello?', privateTo: person.id });
		const opened = ok(startSessionAct(ctxFor(ai), asked));
		expect(takeNextClick(opened, person.id, '2026-10-25T10:05:00.000Z')?.click.id).toBe(click.id);
	});

	it('an AI client never sends a click, a viewer never prefills', () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		expect(sendClickAct(ctxFor(ai), opened, { kind: 'prefill', fieldPath: '00-need.situation', leafId: null }).ok).toBe(false);
		expect(sendClickAct(ctxFor(viewer), opened, { kind: 'prefill', fieldPath: '00-need.situation', leafId: null }).ok).toBe(false);
		expect(sendClickAct(ctxFor(viewer), opened, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'A question' }).ok).toBe(true);
	});

	it("the AI's reply in the thread answers the ask it took", () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const asked = ok(sendClickAct(ctxFor(person), opened, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'What is missing?' }));
		const taken = takeNextClick(asked, person.id, '2026-10-25T10:01:00.000Z')!;
		const answer = answerOf('post_on_field', { fieldPath: '00-need.situation', replyTo: taken.click.messageId, body: 'The opening hours.' })!;
		const answered = recordAnswerAct(ctxFor(ai), taken.request, answer);
		expect(answered?.aiClicks[0].state).toBe('answered');
		// A person's own reply answers nothing on the AI's behalf.
		expect(recordAnswerAct(ctxFor(person), taken.request, answer)).toBeNull();
	});

	it('the person withdraws a waiting click and ends the session', () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const clicked = ok(sendClickAct(ctxFor(person), opened, { kind: 'prefill', fieldPath: '00-need.situation', leafId: null }));
		const withdrawn = ok(withdrawClickAct(ctxFor(person), clicked, clicked.aiClicks[0].id));
		expect(withdrawn.aiClicks[0].state).toBe('withdrawn');
		const ended = ok(endSessionAct(ctxFor(person), withdrawn, null));
		expect(openSessionOf(ended, person.id)).toBeNull();
		expect(ended.liveSessions[0].endReason).toBe('ended_by_person');
	});
});
