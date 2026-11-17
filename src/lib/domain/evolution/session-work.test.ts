import { describe, expect, it } from 'vitest';
import { createEmptyEvolutionDraft, createEvolutionRequest, type ProjectEvolutionDraft } from './draft';
import { LIVE_SESSION, isIdle, startSession } from './live-session';
import {
	answerProjectClick,
	endProjectSession,
	isProjectIdle,
	projectSessionEnding,
	sendProjectClick,
	sessionWorkDone,
	startProjectSession,
	takeProjectClick,
	type ProjectClickInput
} from './project-session';

const T = (m: number) => new Date(Date.UTC(2026, 10, 4, 19, m)).toISOString();
const ana = 'ana@acme.io';
const draftWith = (over: Partial<ProjectEvolutionDraft> = {}): ProjectEvolutionDraft => ({ ...createEmptyEvolutionDraft('p'), requests: [], ...over });
const reread: ProjectClickInput = { kind: 'reread', page: 'spec', anchor: 'feature:f1', title: 'Crash and game over', featureId: 'f1' };

function opened(at = T(33)): ProjectEvolutionDraft {
	const outcome = startProjectSession(draftWith(), ana, 's1', at);
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.draft;
}

describe('an AI at work keeps its session as long as it works [criterion:122ab5c8]', () => {
	it('counts every act of the AI against idleEndSeconds, not only the person’s', () => {
		const draft = opened(T(0));
		const later = new Date(Date.parse(T(0)) + (LIVE_SESSION.idleEndSeconds + 60) * 1000).toISOString();
		expect(isProjectIdle(draft, ana, later)).toBe(true);
		// The AI wrote the specification five minutes ago: the session stays.
		const wrote = new Date(Date.parse(later) - 300_000).toISOString();
		expect(isProjectIdle(draft, ana, later, [wrote])).toBe(false);
		// A session on a request reads the same.
		const started = startSession(createEvolutionRequest({ id: 'r1', title: 'Order the day before', status: 'open' }), ana, 'r-s1', T(0));
		if (!started.ok) throw new Error(started.reason);
		expect(isIdle(started.request, ana, later)).toBe(true);
		expect(isIdle(started.request, ana, later, wrote)).toBe(false);
	});

	it('reads the AI gone only after disconnectAfterSeconds without any call, longer than half an hour of thought', () => {
		expect(LIVE_SESSION.disconnectAfterSeconds).toBeGreaterThan(LIVE_SESSION.idleEndSeconds);
		const pulse = { idle: false, callHeld: false, working: false, quietSinceMs: 0 };
		expect(projectSessionEnding({ ...pulse, nowMs: 40 * 60_000 })).toBeNull();
		expect(projectSessionEnding({ ...pulse, nowMs: LIVE_SESSION.disconnectAfterSeconds * 1000 })).toBe('gone');
	});
});

describe('the session ends for the AI once its work is done [criterion:45933ee4]', () => {
	const answered = () => {
		// Trex runner: validated at 19:27, the re-reading sent 19:31, the session opened 19:33, taken 19:35, answered 19:38.
		const sent = sendProjectClick(draftWith(), ana, reread, true, 'c1', T(31));
		if (!sent.ok) throw new Error(sent.reason);
		const session = startProjectSession(sent.draft, ana, 's1', T(33));
		if (!session.ok) throw new Error(session.reason);
		const taken = takeProjectClick(session.draft, 'c1', T(35))!;
		const done = answerProjectClick(taken.draft, ana, 'c1', 'Nothing to correct: the code reads as the specification.', T(38));
		if (!done.ok) throw new Error(done.reason);
		return done.draft;
	};

	it('ends once the AI answered and nothing waits on a finished product', () => {
		const draft = answered();
		expect(sessionWorkDone(draft, ana, 's1', T(27), false)).toBe(true);
		const ended = endProjectSession(draft, ana, 'finished', T(38), 's1');
		expect(ended.ok && ended.session.endReason).toBe('finished');
	});

	it('keeps listening while work is left, on a request, or before the AI did anything', () => {
		const draft = answered();
		// The Reverse-Specification runs or is in review: no finishing moment.
		expect(sessionWorkDone(draft, ana, 's1', null, false)).toBe(false);
		// An Evolution request is worked in this session.
		expect(sessionWorkDone(draft, ana, 's1', T(27), true)).toBe(false);
		// Another click waits.
		const again = sendProjectClick(draft, ana, { ...reread, featureId: 'f2', anchor: 'feature:f2', title: 'Jump' }, true, 'c2', T(39));
		if (!again.ok) throw new Error(again.reason);
		expect(sessionWorkDone(again.draft, ana, 's1', T(27), false)).toBe(false);
		// A session just opened on a finished product listens for its first click.
		expect(sessionWorkDone(opened(), ana, 's1', T(27), false)).toBe(false);
		// The Reverse-Specification the AI ran finished while the session was open.
		expect(sessionWorkDone(opened(T(10)), ana, 's1', T(27), false)).toBe(true);
	});
});
