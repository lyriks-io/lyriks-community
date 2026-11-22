import type { LiveSession } from './live-session';

/**
 * Which of a person's AIs a click goes to (EVO-015, "Hand my oldest click to my
 * AI"): a person may keep several AIs in session on one project, and each click
 * reaches exactly one of them without the person choosing. Every kind of click
 * is routed here, the ones made on a request, the ones made outside one, and
 * the kinds later changes add: a new kind only says what it touches. Pure.
 */

/** What a click touches: what decides the AI it goes to. */
export type ClickSubject =
	| { readonly kind: 'request'; readonly requestId: string }
	| { readonly kind: 'run'; readonly runId: string }
	/** A question one AI asked another: it goes to the AI it is addressed to, and to no other. */
	| { readonly kind: 'session'; readonly sessionId: string }
	| { readonly kind: 'none' };

/** What the server knows of one session's AI right now. */
export interface SessionStanding {
	/** Its waiting call is held and was heard lately: it can take a click at once. */
	readonly free: boolean;
	/** It is on a click: it takes the next one when it waits again. */
	readonly working: boolean;
}

export const NO_SUBJECT: ClickSubject = { kind: 'none' };

/**
 * The session a click goes to, or null while it waits for one: the session
 * that already holds what the click touches, as long as its AI is still there
 * (free or at work), even when that AI is busy; else the free session opened
 * last; else none, and the click waits for the first AI that frees up. A
 * question goes to the session it is addressed to, or to nobody.
 */
export function clickRecipient(input: {
	readonly subject: ClickSubject;
	/** The person's open sessions on the project. */
	readonly sessions: readonly LiveSession[];
	/** The open session that holds what the click touches, if any. */
	readonly holder: string | null;
	readonly standing: (sessionId: string) => SessionStanding;
}): string | null {
	const { subject, sessions, holder, standing } = input;
	const open = (id: string | null): id is string => !!id && sessions.some((s) => s.id === id);
	if (subject.kind === 'session') return open(subject.sessionId) ? subject.sessionId : null;
	if (open(holder)) {
		const there = standing(holder);
		if (there.free || there.working) return holder;
	}
	const free = sessions.filter((s) => standing(s.id).free).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	return free[0]?.id ?? null;
}
