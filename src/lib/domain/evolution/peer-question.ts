import { firstRefusal, guard, refuse, type Refused } from './guard';
import type { ProjectEvolutionDraft } from './draft';
import { LIVE_SESSION, secondsBetween } from './live-session';
import { openProjectSessionOf, sessionName, type ProjectClick } from './project-session';

/**
 * One AI of a person asks another of their AIs a question ("Ask another AI of
 * mine", EVO-015): the question waits in the other's wait like a click, the
 * other answers it with answer_click, and the answer comes back to the asker;
 * with no answer within peerAnswerSeconds, or once the other session ended, it
 * expires and its asker is told. AIs of different people never reach each
 * other: a question only names a session of the same person. Pure.
 */

/** The most characters of one question to another AI (parameter question). */
export const QUESTION_MAX = 2000;

export const QUESTION_REFUSALS = {
	noSession: 'No session is open on this project: open one with start_evolution_session given the project alone.',
	self: 'Ask another of your AIs, not your own session.',
	notOpen: 'No open session of yours has that id on this project: read_evolution_sessions lists them.',
	empty: 'question is required: one question for the other AI.'
} as const;

export type QuestionOutcome = { readonly ok: true; readonly draft: ProjectEvolutionDraft; readonly click: ProjectClick } | Refused;

/** Ask: the question waits for the AI it is addressed to (rules 5215082c, ed59b0bd, 029ae04e, 471078f2). */
export function askAnotherAi(
	draft: ProjectEvolutionDraft,
	personId: string,
	input: { readonly from: string; readonly to: string; readonly question: string },
	id: string,
	at: string
): QuestionOutcome {
	const from = openProjectSessionOf(draft, personId, input.from);
	const to = input.to && input.to !== input.from ? openProjectSessionOf(draft, personId, input.to) : null;
	const question = input.question.trim();
	const allowed = firstRefusal(
		guard(!from, QUESTION_REFUSALS.noSession, 'The answer comes back through the asker\'s own session.'),
		guard(input.to === input.from, QUESTION_REFUSALS.self, 'A question to its own session would wait on the very call that asks it.'),
		guard(!to, QUESTION_REFUSALS.notOpen, 'AIs of different people never speak to each other, and a session that ended answers nothing.'),
		guard(!question, QUESTION_REFUSALS.empty, 'The other AI is interrupted for a question.')
	);
	if (!allowed.ok || !from || !to) return allowed.ok ? refuse(QUESTION_REFUSALS.notOpen, '') : allowed;
	const click: ProjectClick = {
		id,
		personId,
		kind: 'question',
		page: 'spec',
		anchor: '',
		title: `a question of ${sessionName(draft, personId, from)}`,
		text: question.slice(0, QUESTION_MAX),
		fromSessionId: from.id,
		toSessionId: to.id,
		at,
		state: 'waiting'
	};
	return { ok: true, click, draft: { ...draft, clicks: [...(draft.clicks ?? []), click] } };
}

/** Where a question stands for the AI that asked it ("Another AI answers my question", "My question runs out"). */
export type QuestionStanding =
	| { readonly state: 'waiting' }
	| { readonly state: 'answered'; readonly answer: string; readonly by: string }
	| { readonly state: 'expired' };

export function questionStanding(draft: ProjectEvolutionDraft, personId: string, clickId: string, now: string): QuestionStanding {
	const click = (draft.clicks ?? []).find((c) => c.id === clickId && c.kind === 'question');
	if (!click || click.expired || click.state === 'withdrawn' || click.state === 'cancelled') return { state: 'expired' };
	if (click.state === 'answered') {
		const to = (draft.sessions ?? []).find((s) => s.id === click.toSessionId);
		return { state: 'answered', answer: click.answer ?? '', by: to ? sessionName(draft, personId, to) : 'your other AI' };
	}
	// The AI asked left (rule d6dfac9c): no answer will come.
	if (!openProjectSessionOf(draft, personId, click.toSessionId)) return { state: 'expired' };
	return secondsBetween(click.at, now) >= LIVE_SESSION.peerAnswerSeconds ? { state: 'expired' } : { state: 'waiting' };
}

/**
 * The question runs out (rules 02ee8102 and d6dfac9c): it leaves the other
 * AI's queue, and an answer it would still send is refused. An answered
 * question stays as it is.
 */
export function expireQuestion(draft: ProjectEvolutionDraft, clickId: string): ProjectEvolutionDraft {
	const click = (draft.clicks ?? []).find((c) => c.id === clickId && c.kind === 'question');
	if (!click || click.state === 'answered' || click.expired) return draft;
	return { ...draft, clicks: (draft.clicks ?? []).map((c) => (c.id === clickId ? { ...c, state: 'withdrawn' as const, expired: true as const } : c)) };
}
