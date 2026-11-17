import { describe, expect, it } from 'vitest';
import { createEmptyEvolutionDraft, createEvolutionRequest, type ProjectEvolutionDraft } from './draft';
import { openSessionOf, sendClick, startSession } from './live-session';
import {
	answerProjectClick,
	sessionCallTarget,
	closeProjectTurn,
	endProjectSession,
	isProjectIdle,
	nextClickOf,
	openProjectSessionOf,
	pendingProjectClicksOf,
	sendProjectClick,
	startProjectSession,
	takeProjectClick,
	withdrawProjectClick,
	withMirror,
	projectSessionEnding,
	type ProjectClickInput
} from './project-session';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';

/** feat-ai-session: one session of the person's own AI for the whole project. */

const T = (m: number) => new Date(Date.UTC(2026, 9, 29, 10, m)).toISOString();
const ana = 'ana@acme.io';
const request = createEvolutionRequest({ id: 'r1', title: 'Order the day before', status: 'open' });
const draftWith = (over: Partial<ProjectEvolutionDraft> = {}): ProjectEvolutionDraft => ({ ...createEmptyEvolutionDraft('p'), requests: [request], ...over });
const ask = (text: string): ProjectClickInput => ({ kind: 'ask_block', page: 'spec', anchor: 'feature:f1', title: 'Shorten a link', threadId: 't1', messageId: 'm1', text });
const reread: ProjectClickInput = { kind: 'reread', page: 'spec', anchor: 'feature:f1', title: 'Shorten a link', featureId: 'f1' };

const opened = (draft = draftWith()) => {
	const outcome = startProjectSession(draft, ana, 's1', T(0));
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.draft;
};

describe('one session per person and project covers every page [criterion:ac-leaf-ac-ai-session-project]', () => {
	it('opens on the project, and a new one replaces it and every session of the person on a request', () => {
		const onRequest = startSession(request, ana, 'old', T(0));
		if (!onRequest.ok) throw new Error(onRequest.reason);
		const first = opened(draftWith({ requests: [onRequest.request] }));
		expect(openProjectSessionOf(first, ana)?.id).toBe('s1');
		expect(openSessionOf(first.requests[0], ana)).toBeNull();
		const second = startProjectSession(first, ana, 's2', T(1));
		if (!second.ok) throw new Error(second.reason);
		expect(second.replaced?.id).toBe('s1');
		expect(second.draft.sessions?.find((s) => s.id === 's1')).toMatchObject({ endReason: 'replaced' });
	});

	it('hands a click on a request through that request, which gets a session of the same id', () => {
		const draft = opened();
		const mirrored = withMirror(draft.requests[0], ana, openProjectSessionOf(draft, ana)!, T(1));
		expect(openSessionOf(mirrored, ana)?.id).toBe('s1');
		expect(withMirror(mirrored, ana, openProjectSessionOf(draft, ana)!, T(2))).toBe(mirrored);
	});

	it('hands the oldest click first, outside a request or on one', () => {
		const clicked = sendClick(request, ana, { kind: 'prefill', fieldPath: '00-need.problem', leafId: null }, true, 'c1', T(2));
		if (!clicked.ok) throw new Error(clicked.reason);
		const asked = sendProjectClick(opened(draftWith({ requests: [clicked.request] })), ana, ask('Why?'), false, 'p1', T(3));
		if (!asked.ok) throw new Error(asked.reason);
		expect(nextClickOf(asked.draft, ana)).toMatchObject({ where: 'request', requestId: 'r1' });
		const later = sendProjectClick(opened(), ana, ask('Why?'), false, 'p2', T(1));
		if (!later.ok) throw new Error(later.reason);
		expect(nextClickOf({ ...later.draft, requests: [clicked.request] }, ana)).toMatchObject({ where: 'project', click: { id: 'p2' } });
	});
});

describe('a question on a block waits for the AI, which answers it [criterion:ac-leaf-ac-ai-session-ask-block]', () => {
	it('refuses an empty question, and keeps one sent without a session for the next', () => {
		expect(sendProjectClick(draftWith(), ana, ask('  '), true, 'p1', T(1))).toMatchObject({ ok: false, reason: 'Write your question first.' });
		const waiting = sendProjectClick(draftWith(), ana, ask('Why can a guest not shorten?'), false, 'p1', T(1));
		expect(waiting.ok && pendingProjectClicksOf(waiting.draft, ana).map((c) => c.state)).toEqual(['waiting']);
	});

	it('is withdrawn while it waits, taken, then answered once with what the AI said', () => {
		const sent = sendProjectClick(opened(), ana, ask('Why?'), false, 'p1', T(1));
		if (!sent.ok) throw new Error(sent.reason);
		expect(withdrawProjectClick(sent.draft, ana, 'p1').ok).toBe(true);
		const taken = takeProjectClick(sent.draft, 'p1', T(2))!;
		expect(withdrawProjectClick(taken.draft, ana, 'p1')).toMatchObject({ ok: false });
		expect(answerProjectClick(taken.draft, ana, 'p1', '', T(3))).toMatchObject({ ok: false, reason: 'An answer says something.' });
		const answered = answerProjectClick(taken.draft, ana, 'p1', 'The instance owner decides.', T(3));
		expect(answered.ok && answered.click).toMatchObject({ state: 'answered', answer: 'The instance owner decides.' });
		expect(answerProjectClick(answered.ok ? answered.draft : taken.draft, ana, 'p1', 'Again', T(4))).toMatchObject({ ok: false });
	});
});

describe('a re-reading of the code is asked by an editor and answered by one sentence [criterion:ac-leaf-ac-ai-session-reread]', () => {
	it('is refused to who may not edit, and asked twice is the same request', () => {
		expect(sendProjectClick(draftWith(), ana, reread, false, 'p1', T(1))).toMatchObject({ ok: false, reason: 'Only who may edit the project asks for its code to be re-read.' });
		const first = sendProjectClick(draftWith(), ana, reread, true, 'p1', T(1));
		if (!first.ok) throw new Error(first.reason);
		const again = sendProjectClick(first.draft, ana, reread, true, 'p2', T(2));
		expect(again.ok && again.click.id).toBe('p1');
		expect(again.ok && again.draft).toBe(first.draft);
	});

	it('taken and let go of with no answer, it reads nothing written', () => {
		const sent = sendProjectClick(opened(), ana, reread, true, 'p1', T(1));
		if (!sent.ok) throw new Error(sent.reason);
		const taken = takeProjectClick(sent.draft, 'p1', T(2))!;
		expect(answerProjectClick(taken.draft, ana, 'p1', ' ', T(3))).toMatchObject({ ok: false, reason: 'Say what changed, or that nothing needed to change.' });
		const closed = closeProjectTurn(taken.draft, ana, T(4));
		expect(closed.clicks?.[0]).toMatchObject({ state: 'answered', answeredNothing: true });
	});
});

describe('the session ends, and loses no click [criterion:ac-leaf-ac-ai-session-end]', () => {
	it('ending gives back the click in hand and ends the sessions it opened on requests', () => {
		const sent = sendProjectClick(opened(), ana, reread, true, 'p1', T(1));
		if (!sent.ok) throw new Error(sent.reason);
		const taken = takeProjectClick(sent.draft, 'p1', T(2))!;
		const mirrored = { ...taken.draft, requests: [withMirror(taken.draft.requests[0], ana, openProjectSessionOf(taken.draft, ana)!, T(2))] };
		const ended = endProjectSession(mirrored, ana, 'ended_by_person', T(3));
		if (!ended.ok) throw new Error(ended.reason);
		expect(ended.draft.clicks?.[0].state).toBe('waiting');
		expect(openSessionOf(ended.draft.requests[0], ana)).toBeNull();
		expect(endProjectSession(ended.draft, ana, 'ended_by_person', T(4))).toMatchObject({ ok: false, reason: 'There is no session to end.' });
	});

	it('ends idle after half an hour without an act of the person anywhere in the project', () => {
		const draft = opened();
		expect(isProjectIdle(draft, ana, T(29))).toBe(false);
		expect(isProjectIdle(draft, ana, T(31))).toBe(true);
		const asked = sendProjectClick(draft, ana, ask('Why?'), false, 'p1', T(20));
		expect(asked.ok && isProjectIdle(asked.draft, ana, T(31))).toBe(false);
	});

	it('the session and the clicks survive a save', () => {
		const sent = sendProjectClick(opened(), ana, ask('Why?'), false, 'p1', T(1));
		if (!sent.ok) throw new Error(sent.reason);
		const parsed = parseEvolutionDraft(JSON.parse(JSON.stringify(sent.draft)), 'p');
		expect(parsed.sessions).toEqual(sent.draft.sessions);
		expect(parsed.clicks).toEqual(sent.draft.clicks);
	});
});

describe('one session per person and project, whatever the call names [criterion:ac-leaf-ac-ai-session-project]', () => {
	const project = { projectSessionId: 'p1', requestHasOwnSession: false, askedSessionId: 'p1' };

	it('opens the project session when the session is opened on a request', () => {
		expect(sessionCallTarget('start', { ...project, projectSessionId: null })).toBe('project');
		expect(sessionCallTarget('start', { ...project, requestHasOwnSession: true })).toBe('project');
	});

	it('sends waiting, saying and ending to the project session they name, or when they name none', () => {
		for (const act of ['await', 'say', 'end']) {
			expect(sessionCallTarget(act, project)).toBe('project');
			expect(sessionCallTarget(act, { ...project, askedSessionId: '' })).toBe('project');
		}
	});

	it('leaves a session a request opened before the rule its own calls, and the clicks of the page to the request', () => {
		expect(sessionCallTarget('await', { ...project, requestHasOwnSession: true })).toBe('request');
		expect(sessionCallTarget('await', { ...project, askedSessionId: 'r1' })).toBe('request');
		expect(sessionCallTarget('await', { ...project, projectSessionId: null })).toBe('request');
		expect(sessionCallTarget('click', project)).toBe('request');
	});
});

describe('a session its AI left never reads in session (ac-ai-session-end) [criterion:ac-leaf-ac-ai-session-end]', () => {
	const MIN = 60_000;
	const now = Date.parse('2026-10-30T01:00:00.000Z');
	const pulse = (over: Partial<Parameters<typeof projectSessionEnding>[0]>) =>
		projectSessionEnding({ idle: false, callHeld: false, working: false, quietSinceMs: now - 10 * MIN, nowMs: now, ...over });

	it('ends a session nobody acted on for half an hour as idle', () => {
		expect(pulse({ idle: true, callHeld: true })).toBe('idle');
	});

	it('ends as gone a session whose AI holds no call and was not heard for disconnectAfterSeconds', () => {
		expect(pulse({ quietSinceMs: now - 61 * MIN })).toBe('gone');
		// An AI may think for more than half an hour between two calls (criterion 122ab5c8).
		expect(pulse({ quietSinceMs: now - 40 * MIN })).toBeNull();
		expect(pulse({ quietSinceMs: now - 1 * MIN })).toBeNull();
	});

	it('keeps a session whose AI waits or works', () => {
		expect(pulse({ callHeld: true })).toBeNull();
		expect(pulse({ working: true })).toBeNull();
	});
});
