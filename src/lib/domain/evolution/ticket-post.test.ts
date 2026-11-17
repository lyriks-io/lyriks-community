import { describe, expect, it } from 'vitest';
import type { ActContext, ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { pendingClicksOf, startSession, takeNextClick, TICKET_FIELD } from './live-session';
import { reportTicketPostAct, sendTicketClickAct, ticketPostInstruction, ticketPostPrompt } from './ticket-post';

/**
 * The ticket a closed evolution came from is told by the person's own AI,
 * through its own tracker connector: the page hands it the message, and the
 * request keeps only what the AI reported it did.
 */

const person: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { ...person, role: 'viewer' };
const ai: Actor = { id: 'ana@team.test', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({ actor, at: '2026-10-26T10:00:00.000Z', newId: () => `id-${++counter}`, soloWorkspace: true, validators: null });
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const closed = () => createEvolutionRequest({ id: 'req-1', status: 'closed', stage: 'delivered' });
const handOff = { ticketKey: 'FAC-242', message: '✅ EVO-003 · Notes is closed in Lyriks.' };

describe('handing the closing message to the AI', () => {
	it('is a ticket click waiting for the person’s AI, carrying the ticket and the message', () => {
		const sent = ok(sendTicketClickAct(ctxFor(person), closed(), handOff));
		const [click] = pendingClicksOf(sent, person.id);
		expect(click).toMatchObject({ kind: 'ticket', fieldPath: TICKET_FIELD, state: 'waiting', ticket: { key: 'FAC-242', message: handOff.message } });
	});

	it('waits for the close, a ticket and a message, and someone who may edit', () => {
		expect(sendTicketClickAct(ctxFor(person), createEvolutionRequest({ status: 'open' }), handOff)).toMatchObject({ ok: false, reason: 'The ticket is told once the evolution is closed.' });
		expect(sendTicketClickAct(ctxFor(person), closed(), { ...handOff, ticketKey: ' ' }).ok).toBe(false);
		expect(sendTicketClickAct(ctxFor(viewer), closed(), handOff).ok).toBe(false);
		expect(sendTicketClickAct(ctxFor(ai), closed(), handOff).ok).toBe(false);
	});
});

describe('what the AI reports it did on the ticket', () => {
	it('is kept on the request and answers the ticket click in its hands', () => {
		const sent = ok(sendTicketClickAct(ctxFor(person), closed(), handOff));
		const session = startSession(sent, person.id, 's-1', '2026-10-26T10:00:00.000Z');
		if (!session.ok) throw new Error('no session');
		const taken = takeNextClick(session.request, person.id, '2026-10-26T10:01:00.000Z');
		const reported = ok(reportTicketPostAct(ctxFor(ai), taken!.request, { ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: true }));
		expect(reported.ticketPost).toEqual({ at: '2026-10-26T10:00:00.000Z', by: ai.id, byKind: 'ai_client', ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: true, note: '' });
		expect(pendingClicksOf(reported, person.id)).toEqual([]);
	});

	it('says why when the message was not posted, and never on an open request', () => {
		expect(reportTicketPostAct(ctxFor(ai), closed(), { ticketKey: 'FAC-242', tool: 'Jira', commented: false, movedToDone: false })).toMatchObject({ ok: false, reason: 'Say why the message was not posted (note).' });
		const failed = ok(reportTicketPostAct(ctxFor(ai), closed(), { ticketKey: 'FAC-242', tool: 'Jira', commented: false, movedToDone: false, note: 'No Jira connector is connected to me.' }));
		expect(failed.ticketPost?.note).toBe('No Jira connector is connected to me.');
		expect(reportTicketPostAct(ctxFor(ai), createEvolutionRequest(), { ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: true }).ok).toBe(false);
	});
});

describe('the instruction the AI reads', () => {
	it('names the ticket and the one operation that reports it, in a click and in the prompt alike', () => {
		const target = { projectId: 'proj', requestId: 'req-1', ticketKey: 'FAC-242' };
		const op = '{ op: "report_ticket_post", requestId: "req-1", ticketKey: "FAC-242"';
		expect(ticketPostInstruction(target)).toContain(op);
		const prompt = ticketPostPrompt({ ...target, message: handOff.message });
		expect(prompt).toContain(op);
		expect(prompt).toContain('project proj');
		expect(prompt.endsWith(handOff.message)).toBe(true);
	});
});
