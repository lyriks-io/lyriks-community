import { guard, refuse, type Guarded, type Refused } from './guard';
import { personKey } from './named-validators';
import type { EvolutionRequest, ProjectEvolutionDraft } from './draft';
import { clickRecipient, NO_SUBJECT, type ClickSubject, type SessionStanding } from './click-routing';
import { requestKeyOf } from './request-ref';
import {
	endSession,
	lastPersonActAt,
	LIVE_SESSION,
	openSessionOf,
	pendingClicksOf,
	secondsBetween,
	startSession,
	type AiClickState,
	type LiveSession,
	type SessionEndReason
} from './live-session';

/**
 * The sessions of the person's own AIs on the whole project (feat-ai-session):
 * each AI opens its own from the prompt Ask my AI copies, beside the sessions
 * of the person's other AIs (EVO-015), and each covers the Specification 360°,
 * the Retrospecification, the Evolution board and every request until it ends
 * (ac-ai-session-project). A click goes to one of them (click-routing).
 *
 * The session and the clicks made outside a request (a question on a block, a
 * re-reading of the code) are kept on the project's evolution draft. A click on
 * a request keeps living on that request: when the project session hands it
 * over, the request gets a session of the same id (a mirror), so everything the
 * live Evolution session does on a request stays as it is. Pure.
 */

/**
 * What can be asked of the AI outside a request: a message of a private
 * conversation of Ask my AI (chat, criterion 13235e8e), a re-reading of the
 * code, a Reverse-Specification to run or to resume, handed from Mismatch
 * (run, resume: EVO-014, action 077fe5e2). ask_block is a question an earlier
 * version posted in a block's thread: still answered when one waits, never
 * sent any more (criterion f7249f99).
 */
export const PROJECT_CLICK_KINDS = ['chat', 'ask_block', 'reread', 'run', 'resume', 'question'] as const;
export type ProjectClickKind = (typeof PROJECT_CLICK_KINDS)[number];
export const isProjectClickKind = (v: unknown): v is ProjectClickKind => typeof v === 'string' && (PROJECT_CLICK_KINDS as readonly string[]).includes(v);

/** The kinds that hand a Reverse-Specification run to the AI (EVO-014). */
export const RUN_CLICK_KINDS: ReadonlySet<ProjectClickKind> = new Set(['run', 'resume']);

/** Where a click outside a request was made: Mismatch is the drift page. */
export type ProjectClickPage = 'spec' | 'retrospec' | 'drift';

export interface ProjectClick {
	readonly id: string;
	readonly personId: string;
	readonly kind: ProjectClickKind;
	readonly page: ProjectClickPage;
	/** The place it bears on: a Specification 360° anchor, or a finding of the Retrospecification. */
	readonly anchor: string;
	/** What the place is called, so the AI and the chip name it without reading the page. */
	readonly title: string;
	/** A message of Ask my AI: the conversation it was written in. */
	readonly conversationId?: string;
	/** A question on a block: the thread it was posted in, the message the AI answers and its words. */
	readonly threadId?: string;
	readonly messageId?: string;
	readonly text?: string;
	/** A re-reading: the feature it bears on, when it is one. */
	readonly featureId?: string;
	readonly at: string;
	readonly state: AiClickState;
	readonly takenAt?: string;
	readonly answeredAt?: string;
	/** What the AI answered: the sentence a re-reading shows under its button. */
	readonly answer?: string;
	/** Taken and let go of with no answer: it reads 'Nothing written', never answered. */
	readonly answeredNothing?: true;
	/** The session whose AI took it: only that session gives it back when it ends (EVO-015). */
	readonly sessionId?: string;
	/** A click on a run (a Reverse-Specification run handed to an AI): the session that took one holds the run. */
	readonly runId?: string;
	/** A question one AI of the person asked another (EVO-015): who asked it, and whom. */
	readonly fromSessionId?: string;
	readonly toSessionId?: string;
	/** A question that waited past peerAnswerSeconds, or whose AI left: its asker was told no answer came. */
	readonly expired?: true;
}

/** What the page sends for a click outside a request. */
export type ProjectClickInput = Omit<
	ProjectClick,
	'id' | 'personId' | 'at' | 'state' | 'takenAt' | 'answeredAt' | 'answer' | 'answeredNothing' | 'sessionId' | 'fromSessionId' | 'toSessionId' | 'expired'
>;

/** What a project draft keeps of the sessions and of the clicks made outside a request. */
export type SessionsOfProject = Pick<ProjectEvolutionDraft, 'sessions' | 'clicks'>;

const KEPT_SESSIONS = 20;
const KEPT_SETTLED_CLICKS = 50;
const same = (a: string, b: string) => personKey(a) === personKey(b);
const sessionsOf = (draft: SessionsOfProject) => draft.sessions ?? [];
const clicksOf = (draft: SessionsOfProject) => draft.clicks ?? [];
const settled = (c: ProjectClick) => c.state === 'answered' || c.state === 'withdrawn' || c.state === 'cancelled';

/** The person's sessions open on the project, one per AI, oldest first (EVO-015). */
export function openProjectSessionsOf(draft: SessionsOfProject, personId: string): LiveSession[] {
	return sessionsOf(draft).filter((s) => same(s.personId, personId) && !s.endedAt);
}

/**
 * One open session of the person: the one named, or the most recently opened
 * when the call names none (a page, or a client older than several AIs).
 */
export function openProjectSessionOf(draft: SessionsOfProject, personId: string, sessionId?: string): LiveSession | null {
	const open = openProjectSessionsOf(draft, personId);
	if (sessionId) return open.find((s) => s.id === sessionId) ?? null;
	return open.length > 0 ? open[open.length - 1] : null;
}

/** The person's last session on the project, open or ended, so the chip can say why it ended; the one named when an id is given. */
export function lastProjectSessionOf(draft: SessionsOfProject, personId: string, sessionId?: string): LiveSession | null {
	const mine = sessionsOf(draft).filter((s) => same(s.personId, personId) && (!sessionId || s.id === sessionId));
	return mine.length > 0 ? mine[mine.length - 1] : null;
}

/** The sessions a project keeps: the 20 latest, and never one still open (criterion b1e37149). */
function keptSessions(sessions: readonly LiveSession[]): LiveSession[] {
	let excess = sessions.length - KEPT_SESSIONS;
	if (excess <= 0) return [...sessions];
	return sessions.filter((s) => {
		if (excess <= 0 || !s.endedAt) return true;
		excess--;
		return false;
	});
}

/** The person's clicks outside a request still waiting or in the AI's hands, oldest first. */
export function pendingProjectClicksOf(draft: SessionsOfProject, personId: string): ProjectClick[] {
	return clicksOf(draft).filter((c) => same(c.personId, personId) && (c.state === 'waiting' || c.state === 'taken'));
}

/** The click a message of an Ask my AI conversation waits on or is in the AI's hands with, if any (rule 592df8c9). */
export function pendingChatClickOf(draft: SessionsOfProject, personId: string, conversationId: string): ProjectClick | null {
	return pendingProjectClicksOf(draft, personId).find((c) => c.kind === 'chat' && c.conversationId === conversationId) ?? null;
}

function pruned(clicks: readonly ProjectClick[]): ProjectClick[] {
	const done = clicks.filter(settled);
	if (done.length <= KEPT_SETTLED_CLICKS) return [...clicks];
	const dropped = new Set(done.slice(0, done.length - KEPT_SETTLED_CLICKS).map((c) => c.id));
	return clicks.filter((c) => !dropped.has(c.id));
}

/**
 * Whether a taken click is in the hands of this session: one it took, or one
 * taken before clicks named their session, which belongs to whichever session
 * of the person ends first.
 */
const heldBy = (c: ProjectClick, sessionId: string) => c.state === 'taken' && (!c.sessionId || c.sessionId === sessionId);

/** What the AI had in hand goes back to waiting, for another AI of the person: a session that ends loses no click (rule c51e2223). */
function giveBack(clicks: readonly ProjectClick[], personId: string, sessionId: string): ProjectClick[] {
	return clicks.map((c) => {
		if (!same(c.personId, personId) || !heldBy(c, sessionId)) return c;
		// A question in the hands of an AI that left reaches nobody else: its asker is told no answer came.
		if (c.kind === 'question') return { ...c, state: 'withdrawn' as const, expired: true as const };
		const rest = { ...c, state: 'waiting' as const };
		delete (rest as { takenAt?: string }).takenAt;
		delete (rest as { sessionId?: string }).sessionId;
		return rest;
	});
}

/** The questions addressed to a session that ended wait for nobody: they expire, and their askers are told (EVO-015). */
function expireQuestionsTo(clicks: readonly ProjectClick[], sessionId: string): ProjectClick[] {
	return clicks.map((c) => (c.kind === 'question' && c.toSessionId === sessionId && c.state === 'waiting' ? { ...c, state: 'withdrawn' as const, expired: true as const } : c));
}

/** End the person's request sessions: by id (the mirrors of a project session), or every one (a new project session replaces them). */
function endOnRequests(requests: readonly EvolutionRequest[], personId: string, reason: SessionEndReason, at: string, sessionId?: string): EvolutionRequest[] {
	return requests.map((r) => {
		const open = openSessionOf(r, personId);
		if (!open || (sessionId && open.id !== sessionId)) return r;
		const outcome = endSession(r, personId, reason, at, open.id);
		return outcome.ok ? outcome.request : r;
	});
}

export type ProjectSessionOutcome = { readonly ok: true; readonly draft: ProjectEvolutionDraft; readonly session: LiveSession } | Refused;

/** What an AI says of itself when it opens its session (EVO-015). */
export interface SessionOpening {
	/** Its client, as the person knows it: it names the session. */
	readonly client?: string;
	/** The request it opens on: it holds that request from the start. */
	readonly startsOn?: string;
}

/** The most characters of a client's name: a name, never a text (parameter client of "Open the session"). */
export const CLIENT_NAME_MAX = 60;

/**
 * Open one AI's session on the project ("Open the session", rule edea94b0): a
 * person works with several AIs at once, so the sessions their other AIs hold
 * stay open with whatever they hold (EVO-015). A click taken by a session that
 * is no longer open, which nothing else would ever give back, waits again.
 */
export function startProjectSession(draft: ProjectEvolutionDraft, personId: string, id: string, at: string, opening: SessionOpening = {}): ProjectSessionOutcome {
	const client = (opening.client ?? '').trim().slice(0, CLIENT_NAME_MAX);
	const session: LiveSession = { id, personId, startedAt: at, ...(client ? { client } : {}), ...(opening.startsOn ? { startsOn: opening.startsOn } : {}) };
	const open = new Set(openProjectSessionsOf(draft, personId).map((s) => s.id));
	const orphans = clicksOf(draft).map((c) => {
		if (!same(c.personId, personId) || c.state !== 'taken' || !c.sessionId || open.has(c.sessionId)) return c;
		const rest = { ...c, state: 'waiting' as const };
		delete (rest as { takenAt?: string }).takenAt;
		delete (rest as { sessionId?: string }).sessionId;
		return rest;
	});
	return { ok: true, session, draft: { ...draft, sessions: keptSessions([...sessionsOf(draft), session]), clicks: orphans } };
}

/**
 * End one AI's session on the project and on every request it reached, saying
 * why (ac-ai-session-end): the clicks it had not answered wait again for
 * another AI of the person, and the person's other sessions stay as they are.
 */
export function endProjectSession(draft: ProjectEvolutionDraft, personId: string, reason: SessionEndReason, at: string, sessionId?: string): ProjectSessionOutcome {
	const open = openProjectSessionOf(draft, personId, sessionId);
	if (!open) return refuse('There is no session to end.', 'Ask my AI offers to end a session only while one is open.');
	const session: LiveSession = { ...open, endedAt: at, endReason: reason };
	return {
		ok: true,
		session,
		draft: {
			...draft,
			sessions: sessionsOf(draft).map((s) => (s.id === open.id ? session : s)),
			clicks: expireQuestionsTo(giveBack(clicksOf(draft), personId, open.id), open.id),
			requests: endOnRequests(draft.requests, personId, reason, at, open.id)
		}
	};
}

/**
 * The request gets a session of the project session's id, so a click made on it
 * is handed over exactly as in a session opened on that request
 * (ac-ai-session-project). A request already in that session is left alone.
 */
export function withMirror(request: EvolutionRequest, personId: string, session: LiveSession, at: string): EvolutionRequest {
	if (openSessionOf(request, personId)?.id === session.id) return request;
	const started = startSession(request, personId, session.id, at);
	return started.ok ? started.request : request;
}

/** Whether the person may send this click outside a request ("Ask your AI about a block", "Re-read the code with my AI"). */
export function projectClickAllowed(input: Pick<ProjectClickInput, 'kind' | 'text'>, canEdit: boolean): Guarded {
	if (input.kind === 'reread')
		return guard(!canEdit, 'Only who may edit the project asks for its code to be re-read.', 'A re-reading rewrites the specification.');
	// A run moves the project for the whole team (rule a71e050a of feat-7, dd19853d of feat-119).
	if (RUN_CLICK_KINDS.has(input.kind)) return guard(!canEdit, 'Only who may edit the project hands a run to its AI.', 'A run moves the project for the whole team.');
	return guard(!(input.text ?? '').trim(), 'Write your question first.', 'A question says something.');
}

export type ProjectClickOutcome = { readonly ok: true; readonly draft: ProjectEvolutionDraft; readonly click: ProjectClick } | Refused;

/** A click outside a request waits for the person's AI, with or without a session (ac-ai-session-ask-block, ac-ai-session-reread). */
export function sendProjectClick(draft: ProjectEvolutionDraft, personId: string, input: ProjectClickInput, canEdit: boolean, id: string, at: string): ProjectClickOutcome {
	const allowed = projectClickAllowed(input, canEdit);
	if (!allowed.ok) return allowed;
	// One re-reading of a place, one run to start or resume, waits at a time: a second click on it is the same request.
	const already = pendingProjectClicksOf(draft, personId).find((c) => c.kind === input.kind && (c.kind === 'reread' || RUN_CLICK_KINDS.has(c.kind)) && c.anchor === input.anchor);
	if (already) return { ok: true, draft, click: already };
	const click: ProjectClick = { ...input, id, personId, at, state: 'waiting' };
	return { ok: true, click, draft: { ...draft, clicks: pruned([...clicksOf(draft), click]) } };
}

/** The person takes back a click their AI has not taken yet ("Withdraw the click"). */
export function withdrawProjectClick(draft: ProjectEvolutionDraft, personId: string, clickId: string): ProjectClickOutcome {
	const click = clicksOf(draft).find((c) => c.id === clickId && same(c.personId, personId));
	if (!click || click.state !== 'waiting') return refuse('Nothing waits for your AI.', 'Only a waiting click is withdrawn.');
	const withdrawn: ProjectClick = { ...click, state: 'withdrawn' };
	return { ok: true, click: withdrawn, draft: { ...draft, clicks: clicksOf(draft).map((c) => (c.id === clickId ? withdrawn : c)) } };
}

/** A click outside a request goes into the hands of the session it was routed to ("Hand my oldest click to my AI"). */
export function takeProjectClick(
	draft: ProjectEvolutionDraft,
	clickId: string,
	at: string,
	sessionId?: string
): { readonly draft: ProjectEvolutionDraft; readonly click: ProjectClick } | null {
	const click = clicksOf(draft).find((c) => c.id === clickId && c.state === 'waiting');
	if (!click) return null;
	const taken: ProjectClick = { ...click, state: 'taken', takenAt: at, ...(sessionId ? { sessionId } : {}) };
	return { click: taken, draft: { ...draft, clicks: clicksOf(draft).map((c) => (c.id === clickId ? taken : c)) } };
}

/** The AI answers a click it took: its answer is kept, the click reads answered ("Answer in the block's thread", "Say what the re-reading changed"). */
export function answerProjectClick(draft: ProjectEvolutionDraft, personId: string, clickId: string, answer: string, at: string): ProjectClickOutcome {
	const click = clicksOf(draft).find((c) => c.id === clickId && same(c.personId, personId));
	// A late answer reaches nobody: the asker was told no answer came (rule 3610424e).
	if (click?.kind === 'question' && click.expired)
		return refuse('The question ran out: the AI that asked it was told no answer came.', 'A question waits peerAnswerSeconds for its answer, and no longer once its asker was told.');
	if (!click || click.state !== 'taken') return refuse('No click of yours is in hand: wait for the next one with await_evolution_event.', 'An answer belongs to the click it was taken for.');
	if (!answer.trim()) return refuse(click.kind === 'reread' ? 'Say what changed, or that nothing needed to change.' : 'An answer says something.', 'The person reads what you answered.');
	const answered: ProjectClick = { ...click, state: 'answered', answeredAt: at, answer: answer.trim() };
	return { ok: true, click: answered, draft: { ...draft, clicks: pruned(clicksOf(draft).map((c) => (c.id === clickId ? answered : c))) } };
}

/**
 * Calling again ends the turn of that session: a click it took and did not
 * answer reads 'Nothing written' (ac-evo-live-click-state); the clicks in the
 * hands of the person's other AIs stay theirs.
 */
export function closeProjectTurn(draft: ProjectEvolutionDraft, personId: string, at: string, sessionId: string): ProjectEvolutionDraft {
	const closes = (c: ProjectClick) => same(c.personId, personId) && heldBy(c, sessionId);
	if (!clicksOf(draft).some(closes)) return draft;
	return {
		...draft,
		clicks: clicksOf(draft).map((c) => {
			if (!closes(c)) return c;
			// A question let go of reaches its asker as no answer, never as an empty one.
			if (c.kind === 'question') return { ...c, state: 'withdrawn', expired: true };
			return { ...c, state: 'answered', answeredAt: at, answeredNothing: true };
		})
	};
}

/** The run a click bears on, if any: the one it names, or the one a run click (run, resume: EVO-014) anchors on. */
export function runOfClick(click: Pick<ProjectClick, 'kind' | 'anchor' | 'runId'>): string | null {
	if (click.runId) return click.runId;
	return RUN_CLICK_KINDS.has(click.kind) && click.anchor ? click.anchor : null;
}

/** What a click outside a request touches: a question its addressee, a click on a run that run, anything else nothing in particular. */
export function projectClickSubject(click: ProjectClick): ClickSubject {
	if (click.kind === 'question' && click.toSessionId) return { kind: 'session', sessionId: click.toSessionId };
	const run = runOfClick(click);
	if (run) return { kind: 'run', runId: run };
	return NO_SUBJECT;
}

/**
 * The person's open session that holds what a click touches (EVO-015): for a
 * request, the session whose mirror is open on it, else the newest one opened
 * on it; for a run, the open session that took the latest click on that run.
 */
export function subjectHolder(draft: ProjectEvolutionDraft, personId: string, subject: ClickSubject): string | null {
	const open = openProjectSessionsOf(draft, personId);
	const isOpen = (id: string | undefined): id is string => !!id && open.some((s) => s.id === id);
	switch (subject.kind) {
		case 'session':
			return isOpen(subject.sessionId) ? subject.sessionId : null;
		case 'request': {
			const mirror = openSessionOf(draft.requests.find((r) => r.id === subject.requestId) ?? { liveSessions: [] }, personId)?.id;
			if (isOpen(mirror)) return mirror;
			return [...open].reverse().find((s) => s.startsOn === subject.requestId)?.id ?? null;
		}
		case 'run': {
			const onRun = clicksOf(draft).filter((c) => same(c.personId, personId) && runOfClick(c) === subject.runId && c.sessionId && c.takenAt);
			const latest = onRun.sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? '')).pop();
			return isOpen(latest?.sessionId) ? latest.sessionId : null;
		}
		default:
			return null;
	}
}

/**
 * A request whose clicks a session of the project may hand: open, and holding
 * no session of the person but a mirror of one of their project sessions; a
 * session the request opened itself before the session of the project keeps
 * its own clicks until it ends.
 */
function handableRequest(draft: ProjectEvolutionDraft, personId: string, request: EvolutionRequest): boolean {
	if (request.status !== 'open') return false;
	const own = openSessionOf(request, personId);
	return !own || openProjectSessionsOf(draft, personId).some((s) => s.id === own.id);
}

/** What waits next for the AI: the oldest click of the person that goes to it, outside a request or on one, in the order they were made. */
export type NextClick =
	| { readonly where: 'project'; readonly click: ProjectClick }
	| { readonly where: 'request'; readonly requestId: string; readonly at: string };

/** Every click of the person still waiting, outside a request or on one, oldest first, each with what it touches. */
function waitingClicks(draft: ProjectEvolutionDraft, personId: string): (NextClick & { readonly at: string; readonly subject: ClickSubject })[] {
	const project = clicksOf(draft)
		.filter((c) => same(c.personId, personId) && c.state === 'waiting')
		.map((click) => ({ where: 'project' as const, click, at: click.at, subject: projectClickSubject(click) }));
	const onRequests = draft.requests
		.filter((r) => handableRequest(draft, personId, r))
		.flatMap((r) =>
			pendingClicksOf(r, personId)
				.filter((c) => c.state === 'waiting')
				.map((c) => ({ where: 'request' as const, requestId: r.id, at: c.at, subject: { kind: 'request', requestId: r.id } as ClickSubject }))
		);
	return [...project, ...onRequests].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The clicks that go to this session now, oldest first ("Hand my oldest click
 * to my AI", rules 4f501fce and 9896d434): each click of the person is routed
 * by clickRecipient, the session asking counting as free since it waits.
 */
export function clicksFor(draft: ProjectEvolutionDraft, personId: string, sessionId: string, standing: (sessionId: string) => SessionStanding): NextClick[] {
	const sessions = openProjectSessionsOf(draft, personId);
	if (!sessions.some((s) => s.id === sessionId)) return [];
	const asking = (id: string): SessionStanding => (id === sessionId ? { free: true, working: false } : standing(id));
	return waitingClicks(draft, personId)
		.filter((c) => clickRecipient({ subject: c.subject, sessions, holder: subjectHolder(draft, personId, c.subject), standing: asking }) === sessionId)
		.map((c) => (c.where === 'project' ? { where: 'project', click: c.click } : { where: 'request', requestId: c.requestId, at: c.at }));
}

/** What one session holds, as its name and the other AIs read it (criterion 302dae22). */
export interface SessionHolding {
	/** The requests it is on: the one it opened on, and every one it reached. */
	readonly requests: readonly { readonly id: string; readonly key: string }[];
	/** It took a click on a Reverse-Specification run. */
	readonly run: boolean;
}

export function sessionHolding(draft: ProjectEvolutionDraft, personId: string, session: LiveSession): SessionHolding {
	const on = draft.requests.filter((r) => r.status !== 'deleted' && (openSessionOf(r, personId)?.id === session.id || r.id === session.startsOn));
	const run = clicksOf(draft).some((c) => same(c.personId, personId) && c.sessionId === session.id && runOfClick(c) !== null);
	return { requests: on.map((r) => ({ id: r.id, key: requestKeyOf(draft.requests, r.id) ?? r.id.slice(0, 8) })), run };
}

/** A session's name: its client and what it holds, as Claude Code · EVO-014; the client alone when it holds nothing, Your AI with no client. */
export function sessionName(draft: ProjectEvolutionDraft, personId: string, session: LiveSession): string {
	const holding = sessionHolding(draft, personId, session);
	const held = holding.requests.length > 0 ? holding.requests[holding.requests.length - 1].key : holding.run ? 'Reverse-Specification' : '';
	return [session.client || 'Your AI', held].filter(Boolean).join(' · ');
}

/**
 * Whether the project session has gone idle ("End an idle session"): the person
 * did nothing on the project for idleEndSeconds, counted from their last act
 * anywhere in it, or from the opening (ac-ai-session-end).
 */
export function isProjectIdle(draft: ProjectEvolutionDraft, personId: string, now: string, actsElsewhere: readonly string[] = [], sessionId?: string): boolean {
	const open = openProjectSessionOf(draft, personId, sessionId);
	if (!open) return false;
	const moments = [
		open.startedAt,
		...clicksOf(draft).filter((c) => same(c.personId, personId)).map((c) => c.at),
		...draft.requests.map((r) => lastPersonActAt(r, personId)).filter((m): m is string => m !== null),
		...actsElsewhere
	];
	const since = moments.sort().pop()!;
	return secondsBetween(since, now) >= LIVE_SESSION.idleEndSeconds;
}

/**
 * Whether the session ends because its AI's work is done ("End the session once
 * the work is done", criterion 45933ee4 of feat-ai-session): the project's
 * Reverse-Specification is finished (`retrospecFinishedAt`, null while it runs,
 * in review, or for a project with none), the AI answered a click in this
 * session or the Reverse-Specification finished while it was open, no click of
 * the person waits nor is in hand, and no Evolution request is worked in it
 * (`onRequest`): its tour goes on click after click.
 */
export function sessionWorkDone(
	draft: ProjectEvolutionDraft,
	personId: string,
	sessionId: string,
	retrospecFinishedAt: string | null,
	onRequest: boolean
): boolean {
	const open = openProjectSessionOf(draft, personId, sessionId);
	if (!open || !retrospecFinishedAt || onRequest) return false;
	const mine = clicksOf(draft).filter((c) => same(c.personId, personId));
	if (mine.some((c) => c.state === 'waiting' || heldBy(c, sessionId)) || waitingClicks(draft, personId).length > 0) return false;
	const answeredHere = mine.some((c) => c.state === 'answered' && (!c.sessionId || c.sessionId === sessionId) && (c.answeredAt ?? '') >= open.startedAt);
	return answeredHere || retrospecFinishedAt >= open.startedAt;
}

/**
 * Which session a call naming a request goes to (ac-ai-session-project): every
 * AI's session is the project's, so opening one on a request opens one on the
 * project, started there; waiting, saying and ending go to the project session
 * they name (or the newest when they name none) while the request holds no
 * session of its own, one opened before this rule, which keeps its own calls
 * until it ends.
 */
export function sessionCallTarget(
	act: string,
	facts: { readonly projectSessionId: string | null; readonly requestHasOwnSession: boolean; readonly askedSessionId: string }
): 'project' | 'request' {
	if (act === 'start') return 'project';
	if (act !== 'await' && act !== 'say' && act !== 'end') return 'request';
	const { projectSessionId, requestHasOwnSession, askedSessionId } = facts;
	return projectSessionId && (!askedSessionId || askedSessionId === projectSessionId) && !requestHasOwnSession ? 'project' : 'request';
}

/** What the server knows of a project session's AI when the chip reads it (ac-ai-session-end). */
export interface SessionPulse {
	/** The person did nothing on the project for idleEndSeconds. */
	readonly idle: boolean;
	/** A call of the AI waits for the next click on this server right now. */
	readonly callHeld: boolean;
	/** The AI is on a click (thinking, writing): its silence is watched as it works. */
	readonly working: boolean;
	/** The latest of: the session's opening, this server's start, the AI's last call heard. */
	readonly quietSinceMs: number;
	readonly nowMs: number;
}

/**
 * Whether an open session of the project ends now, and why ("Mark the AI
 * gone", "End an idle session"), checked whenever the chip is read so a
 * session its conversation left never reads in session: idle once the person
 * did nothing for idleEndSeconds; gone once no call of its AI was held nor
 * heard for disconnectAfterSeconds, a restarted server counting from its own start.
 */
export function projectSessionEnding(pulse: SessionPulse): SessionEndReason | null {
	if (pulse.idle) return 'idle';
	if (pulse.callHeld || pulse.working) return null;
	return pulse.nowMs - pulse.quietSinceMs >= LIVE_SESSION.disconnectAfterSeconds * 1000 ? 'gone' : null;
}
