import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import { createEvolutionRequest, type EvolutionRequest } from './draft';
import {
	answerClick,
	closeTakenClicks,
	endSession,
	isIdle,
	journalOnCurrentClick,
	LIVE_SESSION,
	openSessionOf,
	pendingClicksOf,
	sendClick,
	startSession,
	takeNextClick,
	withdrawClick,
	prefillable,
	asksOnThePage,
	sessionFirst,
	ASKED_WITHOUT_SESSION,
	type ClickInput
} from './live-session';
import { answerOf } from './live-session-acts';

/**
 * A live session with one's own AI (feat-evo-live-session): the scenarios of
 * the spec, played on the pure functions the server and the page share.
 */

const ana = 'ana@team.test';
const bo = 'bo@team.test';
const at = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, '0')}:00.000Z`;
const ask = (messageId: string): ClickInput => ({ kind: 'ask', fieldPath: '00-need.problem', leafId: null, messageId });
const prefill: ClickInput = { kind: 'prefill', fieldPath: '00-need.problem', leafId: null };

let counter = 0;
const id = () => `id-${++counter}`;

function opened(request: EvolutionRequest = createEvolutionRequest(), person = ana): EvolutionRequest {
	const outcome = startSession(request, person, id(), at(0));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
}

function clicked(request: EvolutionRequest, input: ClickInput, person = ana, minute = 1): EvolutionRequest {
	const outcome = sendClick(request, person, input, true, id(), at(minute));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
}

describe('opening a session (ac-evo-live-start, ac-evo-live-one-agent)', () => {
	it('opens a session that listens for the person who pasted the prompt', () => {
		const request = opened();
		expect(openSessionOf(request, ana)?.personId).toBe(ana);
		expect(openSessionOf(request, bo)).toBeNull();
	});

	it('a second session replaces the first and gives back the click in hand', () => {
		const first = opened();
		const held = takeNextClick(clicked(first, ask('m1')), ana, at(2))!.request;
		const second = startSession(held, ana, 'second', at(3));
		if (!second.ok) throw new Error(second.reason);
		expect(second.replaced?.id).toBe(openSessionOf(first, ana)!.id);
		expect(second.request.liveSessions.filter((s) => !s.endedAt).map((s) => s.id)).toEqual(['second']);
		expect(second.request.liveSessions.find((s) => s.endReason === 'replaced')).toBeTruthy();
		expect(pendingClicksOf(second.request, ana).map((c) => c.state)).toEqual(['waiting']);
	});
});

describe('sending a click (rules of "Send a click to my AI")', () => {
	it('with no session, every AI click waits for the session the copied prompt opens [criterion:ac-leaf-ac-evo-live-no-session]', () => {
		const draw: ClickInput = { kind: 'draw', fieldPath: 'step.functional_spec.diagram', leafId: null, step: 'functional_spec' };
		const waiting = [ask('m1'), prefill, draw].reduce((request, input, minute) => clicked(request, input, ana, minute + 1), createEvolutionRequest());
		expect(pendingClicksOf(waiting, ana).map((c) => [c.kind, c.state])).toEqual([
			['ask', 'waiting'],
			['prefill', 'waiting'],
			['draw', 'waiting']
		]);
		expect(takeNextClick(opened(waiting), ana, at(6))?.click.kind).toBe('ask');
	});

	it("another member's click never reaches my AI: it waits for their own session", () => {
		const sent = clicked(opened(), prefill, bo);
		expect(pendingClicksOf(sent, bo)).toHaveLength(1);
		expect(takeNextClick(sent, ana, at(2))).toBeNull();
	});

	it('a viewer cannot prefill but may ask in a thread', () => {
		const request = opened();
		const refused = sendClick(request, ana, prefill, false, id(), at(1));
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain('you may still ask in the thread');
		expect(sendClick(request, ana, ask('m1'), false, id(), at(1)).ok).toBe(true);
	});

	it('withdrawing a waiting click, and nothing to withdraw', () => {
		const request = clicked(opened(), prefill);
		const clickId = request.aiClicks[0].id;
		const withdrawn = withdrawClick(request, ana, clickId);
		expect(withdrawn.ok && withdrawn.click.state).toBe('withdrawn');
		expect(withdrawClick(createEvolutionRequest(), ana, 'none').ok).toBe(false);
	});
});

describe('handing clicks to the waiting call (ac-evo-live-click-state)', () => {
	it('the oldest click goes to the waiting call and the other waits its turn', () => {
		const request = clicked(clicked(opened(), ask('m1'), ana, 1), ask('m2'), ana, 2);
		const taken = takeNextClick(request, ana, at(3))!;
		expect(taken.click.messageId).toBe('m1');
		expect(pendingClicksOf(taken.request, ana).map((c) => c.state)).toEqual(['taken', 'waiting']);
		// A click made while the AI thinks waits until it calls again.
		expect(takeNextClick(taken.request, ana, at(4))).toBeNull();
	});

	it('no click, the call keeps waiting', () => {
		expect(takeNextClick(opened(), ana, at(1))).toBeNull();
	});

	it("calling again closes the click answered, and the AI's reply answers it", () => {
		const taken = takeNextClick(clicked(opened(), ask('m1')), ana, at(2))!.request;
		const closed = closeTakenClicks(taken, ana, at(3))!;
		expect(closed.aiClicks[0].state).toBe('answered');
		const replied = answerClick(taken, ana, { kind: 'reply', messageId: 'm1' }, at(3));
		expect(replied.click?.state).toBe('answered');
		// An act with no click in hand answers nothing.
		expect(answerClick(opened(), ana, { kind: 'reply', messageId: 'm1' }, at(3)).click).toBeNull();
	});

	it('a proposal answers a prefill on the same field, a redraw answers a draw on the same step', () => {
		const prefilled = takeNextClick(clicked(opened(), prefill), ana, at(2))!.request;
		expect(answerClick(prefilled, ana, { kind: 'propose', fieldPath: '00-need.problem', leafId: null }, at(3)).click).not.toBeNull();
		expect(answerClick(prefilled, ana, { kind: 'propose', fieldPath: '00-need.cost', leafId: null }, at(3)).click).toBeNull();
		// On a question of a step of prose, the answer the person validates answers it.
		const prose: ClickInput = { kind: 'prefill', fieldPath: 'step.solution.examples', leafId: null };
		const asked = takeNextClick(clicked(opened(), prose), ana, at(2))!.request;
		expect(answerClick(asked, ana, answerOf('answer_step', { step: 'solution', question: 'examples', answer: 'x' })!, at(3)).click).not.toBeNull();
		const draw: ClickInput = { kind: 'draw', fieldPath: 'step.functional_spec.diagram', leafId: null, step: 'functional_spec' };
		const drawn = takeNextClick(clicked(opened(), draw), ana, at(2))!.request;
		expect(answerClick(drawn, ana, { kind: 'redraw', step: 'functional_spec' }, at(3)).click).not.toBeNull();
	});
});

describe('ending a session (ac-evo-live-end, ac-evo-live-nothing-lost)', () => {
	it('ending gives back the click in hand: both clicks wait for the next session', () => {
		const request = takeNextClick(clicked(clicked(opened(), ask('m1'), ana, 1), ask('m2'), ana, 2), ana, at(3))!.request;
		const outcome = endSession(request, ana, 'ended_by_person', at(4));
		if (!outcome.ok) throw new Error(outcome.reason);
		expect(outcome.session.endReason).toBe('ended_by_person');
		expect(openSessionOf(outcome.request, ana)).toBeNull();
		expect(pendingClicksOf(outcome.request, ana).map((c) => c.state)).toEqual(['waiting', 'waiting']);
		// The next session receives them first.
		const next = opened(outcome.request);
		expect(takeNextClick(next, ana, at(5))!.click.messageId).toBe('m1');
	});

	it('nothing to end', () => {
		expect(endSession(createEvolutionRequest(), ana, 'ended_by_person', at(1)).ok).toBe(false);
	});

	it('thirty minutes without a click ends the session, a recent click keeps it', () => {
		const request = opened();
		const minutes = LIVE_SESSION.idleEndSeconds / 60;
		expect(isIdle(request, ana, at(10))).toBe(false);
		expect(isIdle(request, ana, `2026-10-25T10:${String(minutes).padStart(2, '0')}:00.000Z`)).toBe(true);
		const recent = clicked(request, prefill, ana, 20);
		expect(isIdle(recent, ana, `2026-10-25T10:${String(minutes).padStart(2, '0')}:00.000Z`)).toBe(false);
	});
});

describe('a person working on the page is not idle [criterion:ac-leaf-ac-evo-live-end]', () => {
	const late = `2026-10-25T10:${String(LIVE_SESSION.idleEndSeconds / 60).padStart(2, '0')}:00.000Z`;
	const signed = (request: EvolutionRequest, by: string, kind: 'person' | 'ai_client', recordedAt = at(20)): EvolutionRequest => ({
		...request,
		history: [
			...request.history,
			{ id: id(), type: 'field_signature', summary: 'Need validated', authorId: by, authorKind: kind, recordedAt, proposalId: null, acceptedByPersonId: null, supersededById: null, channel: 'page' }
		]
	});

	it('a validation, a written answer or a message of the person keeps the session without any click', () => {
		const request = opened();
		expect(isIdle(signed(request, ana, 'person'), ana, late)).toBe(false);
		const written = { ...request, fieldVersions: [{ id: id(), key: '00-need.situation', value: 'v', by: ana, byKind: 'person' as const, source: 'typed' as const, proposalId: null, at: at(20) }] };
		expect(isIdle(written, ana, late)).toBe(false);
		const stepped = { ...request, stepValidations: [{ step: 'need' as const, validatorIds: [], validations: [{ by: ana, kind: 'person' as const, at: at(20) }] }] };
		expect(isIdle(stepped, ana, late)).toBe(false);
		const posted = {
			...request,
			fieldThreads: [{ id: id(), key: '00-need.situation', state: 'open' as const, messages: [{ id: id(), author: ana, authorKind: 'person' as const, body: 'ok', postedAt: at(20) }], changeValue: null, changedBy: null, changedAt: null }]
		};
		expect(isIdle(posted, ana, late)).toBe(false);
	});

	it("the AI's own writes and another member's acts never keep it", () => {
		const request = opened();
		expect(isIdle(signed(request, ana, 'ai_client'), ana, late)).toBe(true);
		expect(isIdle(signed(request, bo, 'person'), ana, late)).toBe(true);
	});

	it('an act before the opening does not stretch the session', () => {
		const request = opened(signed(createEvolutionRequest(), ana, 'person', '2026-10-25T09:50:00.000Z'));
		expect(isIdle(request, ana, late)).toBe(true);
	});
});

describe('the request keeps sessions and clicks across a save', () => {
	it('reads back what it wrote', () => {
		const request = takeNextClick(clicked(opened(), ask('m1')), ana, at(2))!.request;
		const parsed = parseEvolutionDraft({ projectId: 'p', requests: [request] }, 'p').requests[0];
		expect(parsed.liveSessions).toEqual(request.liveSessions);
		expect(parsed.aiClicks).toEqual(request.aiClicks);
	});
});

describe('a section prefill covers every question of it [criterion:ac-leaf-ac-evo-live-prefill]', () => {
	const section = ['00-need.situation', '00-need.symptoms', '00-need.cost', '00-need.description'];
	const onSection: ClickInput = { kind: 'prefill', fieldPath: '00-need.situation', leafId: null, section };

	it('keeps the questions of the section, never a description, and only on a prefill', () => {
		const request = clicked(opened(), onSection);
		expect(pendingClicksOf(request, ana)[0].section).toEqual(['00-need.situation', '00-need.symptoms', '00-need.cost']);
		const asked = clicked(opened(), { ...ask('m1'), section });
		expect(pendingClicksOf(asked, ana)[0].section).toBeUndefined();
	});

	it('a proposal on any question of the section answers the click', () => {
		const taken = takeNextClick(clicked(opened(), onSection), ana, at(2))!.request;
		const answered = answerClick(taken, ana, { kind: 'propose', fieldPath: '00-need.cost', leafId: null }, at(3));
		expect(answered.click?.state).toBe('answered');
		const elsewhere = answerClick(taken, ana, { kind: 'propose', fieldPath: '00-need.objectives', leafId: null }, at(3));
		expect(elsewhere.click).toBeNull();
	});

	it('survives a reload of the request', () => {
		const request = clicked(opened(), onSection);
		const reread = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p').requests[0];
		expect(pendingClicksOf(reread, ana)[0].section).toEqual(['00-need.situation', '00-need.symptoms', '00-need.cost']);
	});
});

describe('a click is never read as answered when nothing was written for it [criterion:ac-leaf-ac-evo-live-click-state]', () => {
	const solution: ClickInput = { kind: 'prefill', fieldPath: 'step.solution.description', leafId: null, section: ['step.solution.description', 'step.solution.examples'] };

	it('let go of with nothing written, it reads Nothing written', () => {
		const taken = takeNextClick(clicked(opened(), solution), ana, at(2))!.request;
		const closed = closeTakenClicks(taken, ana, at(3))!;
		expect(closed.aiClicks[0]).toMatchObject({ state: 'answered', answeredNothing: true });
	});

	it('with something written for it, it reads answered', () => {
		const taken = takeNextClick(clicked(opened(), solution), ana, at(2))!.request;
		const wrote = journalOnCurrentClick(taken, ana, [{ section: 'evolution', path: ['x'], existedBefore: false, existsAfter: true, after: 1 }], {});
		const closed = closeTakenClicks(wrote, ana, at(3))!;
		expect(closed.aiClicks[0].state).toBe('answered');
		expect(closed.aiClicks[0].answeredNothing).toBeUndefined();
	});
});

describe('a step description is prefilled first, the requester verbatim never [criterion:ac-leaf-ac-evo-live-prefill]', () => {
	it('keeps a step description in the section, drops the requester verbatim and the diagrams', () => {
		expect(prefillable('step.solution.description')).toBe(true);
		expect(prefillable('step.functional_spec.description')).toBe(true);
		expect(prefillable('00-need.description')).toBe(false);
		expect(prefillable('step.functional_spec.diagram')).toBe(false);
	});

	it('writing the description answers the click of its section', () => {
		expect(answerOf('update_step_description', { step: 'solution', description: 'x' })).toEqual({ kind: 'propose', fieldPath: 'step.solution.description', leafId: null });
		const taken = takeNextClick(clicked(opened(), { kind: 'prefill', fieldPath: 'step.solution.description', leafId: null, section: ['step.solution.description'] }), ana, at(2))!.request;
		expect(answerClick(taken, ana, answerOf('update_step_description', { step: 'solution' })!, at(3)).click?.state).toBe('answered');
	});
});

describe('asking on the page opens the session first [criterion:ac-leaf-ac-evo-live-auto-session]', () => {
	const next = { step: 'need', say: 'The answers of the need are proposed.', ask: [], then: ['Read the description.'], personDecides: [] };

	it('a suggestion with a question, or a reply that waits, asks on the page; a plain suggestion does not', () => {
		expect(asksOnThePage({ op: 'propose', question: 'Shall I propose the safer one?', choices: ['Yes', 'No'] })).toBe(true);
		expect(asksOnThePage({ kind: 'post_on_field', asks: true, body: 'Which question does it answer?' })).toBe(true);
		expect(asksOnThePage({ op: 'propose', question: '  ' })).toBe(false);
		expect(asksOnThePage({ op: 'post_on_field', body: 'Done.' })).toBe(false);
		expect(asksOnThePage({ op: 'register_source', question: 'Why?' })).toBe(false);
	});

	it('opening the session comes first in the next steps, once', () => {
		const owed = sessionFirst(next);
		expect(owed.then[0]).toBe(ASKED_WITHOUT_SESSION);
		expect(owed.then).toEqual([ASKED_WITHOUT_SESSION, 'Read the description.']);
		expect(sessionFirst(owed).then).toEqual(owed.then);
		expect(ASKED_WITHOUT_SESSION).toMatch(/start_evolution_session now, then await_evolution_event/);
	});

	it('no session of its own on the request is what makes it owed', () => {
		expect(openSessionOf(createEvolutionRequest(), ana)).toBeNull();
		expect(openSessionOf(opened(), ana)).not.toBeNull();
		expect(openSessionOf(opened(), bo)).toBeNull();
	});
});

describe('the build goes to the AI in session instead of a pasted brief', () => {
	const build: ClickInput = { kind: 'build', fieldPath: 'request.build', leafId: null, build: { brief: 'Implement evolution EVO-1.' } };

	it('a build click carries the brief, waits for the AI, and the report it rebuilds answers it', () => {
		const sent = clicked(opened(), build);
		expect(sent.aiClicks[0]).toMatchObject({ kind: 'build', state: 'waiting', build: { brief: 'Implement evolution EVO-1.' } });
		const taken = takeNextClick(sent, ana, at(2))!.request;
		const answered = answerClick(taken, ana, answerOf('build_implementation_report', {})!, at(3));
		expect(answered.click?.state).toBe('answered');
	});

	it('is refused without a brief, and to a viewer', () => {
		expect(sendClick(opened(), ana, { ...build, build: { brief: ' ' } }, true, id(), at(1)).ok).toBe(false);
		const viewer = sendClick(opened(), ana, build, false, id(), at(1));
		expect(viewer.ok).toBe(false);
		if (!viewer.ok) expect(viewer.reason).toBe('Only who may edit the request hands the build to their AI.');
	});

	it('keeps the brief across a save', () => {
		const request = clicked(opened(), build);
		const parsed = parseEvolutionDraft({ projectId: 'p', requests: [request] }, 'p').requests[0];
		expect(parsed.aiClicks).toEqual(request.aiClicks);
	});
});
