import { firstRefusal, guard, refuse, type Guarded, type Refused } from './guard';
import { personKey } from './named-validators';
import { mergeJournal, type JournalEntry, type JournalSection } from './ai-journal';
import type { EvolutionRequest } from './draft';
import type { HeardProgress } from './live-progress';
import { FUNCTIONAL_DIAGRAM_KEY } from './functional-diagram';
import { drawnDiagramBehind, pairedTexts, PAIRED_STEPS, textsBehindDiagram, type PairedStep } from './functional-sync';

/**
 * A live session between a person on the request page and their own AI client
 * (feat-evo-live-session): the person stays on the page, the AI holds one MCP
 * call open, and every click on an AI button reaches it at once.
 *
 * What lasts is kept on the request: the sessions a person opened and the
 * clicks they sent, so a session that ends loses no click
 * (ac-evo-live-nothing-lost). What the AI is doing right now (listening,
 * thinking, writing) is only ever said live, by the server that holds the call.
 */

/** The numbers of a session, as the spec declares them (constants of feat-evo-live-session). */
export const LIVE_SESSION = {
	/** PROVISIONAL: 900 s holds were measured on Claude Code 2.1.285; 1500 s is measured before it is settled. */
	maxHoldSeconds: 1500,
	/** Measured: a client cuts a call silent for 329 s, a progress notification every 30 s keeps it open. */
	progressIntervalSeconds: 30,
	/** Under the 300 s after which Node fetch cuts a response that sent no headers. */
	platformWaitSeconds: 240,
	/**
	 * PROVISIONAL: how long an AI may make no call on the project, while no call of
	 * it waits, before it reads gone. An AI may think for more than half an hour
	 * between two calls (criterion 122ab5c8 of feat-ai-session).
	 */
	disconnectAfterSeconds: 3600,
	/** PROVISIONAL: how long a session lasts with no act of the person nor of their AI (a wait is not an act). */
	idleEndSeconds: 1800,
	/**
	 * PROVISIONAL: how long an AI's question waits for another AI's answer (EVO-015):
	 * one turn of the platform's wait, so one held call carries it; measured on real
	 * exchanges between two AIs before it is settled. At most platformWaitSeconds.
	 */
	peerAnswerSeconds: 240,
	/**
	 * How recently a waiting AI must have been heard to count as free or as holding
	 * what a click touches (EVO-015): two beats of progressIntervalSeconds, the pace
	 * at which a held call says it still listens.
	 */
	heardWithinSeconds: 60
} as const;

/**
 * `ticket` hands the AI the message of a closed evolution, to post on the
 * ticket it came from and move that ticket to done, through the person's own
 * tracker connector: the platform calls no tracker itself. `build` hands it the
 * brief of the frozen version at Build, so the person does not paste it: the AI
 * writes the code, proves it, syncs the index, and the report it rebuilds
 * answers the click.
 */
export const AI_CLICK_KINDS = ['prefill', 'ask', 'draw', 'ticket', 'build', 'close'] as const;
export type AiClickKind = (typeof AI_CLICK_KINDS)[number];
export const isAiClickKind = (v: unknown): v is AiClickKind =>
	typeof v === 'string' && (AI_CLICK_KINDS as readonly string[]).includes(v);

/** The steps whose diagram the AI can be asked to draw. */
export const DRAWABLE_STEPS = ['functional_spec', 'technical_spec'] as const;
export type DrawableStep = (typeof DRAWABLE_STEPS)[number];
export const isDrawableStep = (v: unknown): v is DrawableStep =>
	typeof v === 'string' && (DRAWABLE_STEPS as readonly string[]).includes(v);

export type AiClickState = 'waiting' | 'taken' | 'answered' | 'withdrawn' | 'cancelled';
/**
 * `finished`: the AI's work is done and nothing waits for it (criterion 45933ee4 of feat-ai-session).
 * `replaced` is only read back from sessions that ended before a person could keep
 * several AIs in session (EVO-015): nothing writes it any more.
 */
export type SessionEndReason = 'ended_by_person' | 'idle' | 'gone' | 'replaced' | 'finished';
export const isSessionEndReason = (v: unknown): v is SessionEndReason =>
	v === 'ended_by_person' || v === 'idle' || v === 'gone' || v === 'replaced' || v === 'finished';

export interface LiveSession {
	readonly id: string;
	readonly personId: string;
	readonly startedAt: string;
	readonly endedAt?: string;
	readonly endReason?: SessionEndReason;
	/** What the AI is, as the person knows it (Claude Code, Codex): with what it holds, it names the session (EVO-015). */
	readonly client?: string;
	/** The request the session was opened on: it holds that request from its opening (EVO-015). */
	readonly startsOn?: string;
	/** The click the AI is on: from taking it until it calls again ("turn.onClick"). */
	readonly currentClickId?: string;
	/** The click the person cancelled while the AI was on it; every act of the AI is refused until it calls again. */
	readonly cancelledClickId?: string;
	/** What the AI last heard of the request, so the person's progress since reaches it once (ac-evo-live-progress-wakes). */
	readonly heard?: HeardProgress;
}

/** One click a person sent to their AI, kept until the AI answered it. */
export interface AiClick {
	readonly id: string;
	readonly personId: string;
	readonly kind: AiClickKind;
	/** The question it bears on (prefill, ask); the diagram's field for a draw. */
	readonly fieldPath: string;
	readonly leafId: string | null;
	/** Every question of the section a prefill was clicked on, fieldPath among them: the AI fills each (ac-evo-live-prefill). */
	readonly section?: readonly string[];
	/** The AI took it and let go of it without writing anything for it: it reads 'Nothing written' (ac-evo-live-click-state). */
	readonly answeredNothing?: true;
	/** Sent by the platform, not clicked: a write left a step's texts and diagram apart (ac-evo-live-follow). */
	readonly follow?: true;
	/** The step whose diagram a draw asks for. */
	readonly step?: DrawableStep;
	/** The message of the thread an ask posted, which the AI answers. */
	readonly messageId?: string;
	/** The suggestion whose question a prefill answers: the AI rewrites it in place (ac-evo-live-card-ask). */
	readonly proposalId?: string;
	/** The prefill of a whole step that sent it, for the section it is on (ac-evo-live-prefill-step). */
	readonly stepPrefillId?: string;
	/** A ticket click: the ticket to post on, and the message to post. */
	readonly ticket?: TicketHandOff;
	/** A build click: the brief of the frozen version, as the Build step composes it. */
	readonly build?: BuildHandOff;
	/** A close click: the step of the close the AI carries out in git or in the index, and its brief. */
	readonly close?: CloseHandOff;
	readonly at: string;
	readonly state: AiClickState;
	readonly takenAt?: string;
	readonly answeredAt?: string;
	/** What the AI wrote for this click while it was on it, undoable until it calls again (ac-evo-live-cancel). */
	readonly journal?: readonly JournalEntry[];
	/** How the cancellation went: how many places were put back, and the ones someone changed since. */
	readonly cancellation?: { readonly at: string; readonly undone: number; readonly kept: readonly string[] };
}

/** What a click asks for, as the page sends it. */
export interface ClickInput {
	readonly kind: AiClickKind;
	readonly fieldPath: string;
	readonly leafId: string | null;
	readonly section?: readonly string[];
	readonly step?: DrawableStep;
	readonly messageId?: string;
	readonly proposalId?: string;
	readonly ticket?: TicketHandOff;
	readonly build?: BuildHandOff;
	readonly close?: CloseHandOff;
}

/** The steps of the close an AI carries out in git or in the index, never Lyriks (ac-evo-verd-steps-to-ai). */
export const CLOSE_STEPS = ['merge', 'sync', 'branch'] as const;
export type CloseStep = (typeof CLOSE_STEPS)[number];
export const isCloseStep = (v: unknown): v is CloseStep => typeof v === 'string' && (CLOSE_STEPS as readonly string[]).includes(v);

/** What a close click hands the AI: the step and its brief, the commands of the step with what they make of the request. */
export interface CloseHandOff {
	readonly step: CloseStep;
	readonly brief: string;
}

/** Where a close click is kept: one place per step, so the page reads each step apart. */
export const closeField = (step: CloseStep): string => `request.close.${step}`;

/** What a build click hands the AI: the brief the Build step shows, the points still open in it. */
export interface BuildHandOff {
	readonly brief: string;
}

/** The place a build click is kept under, beside the request's own answers. */
export const BUILD_FIELD = 'request.build';

/** What a ticket click hands the AI: the ticket, by the key its tracker gives it, and the message to post on it. */
export interface TicketHandOff {
	readonly key: string;
	readonly message: string;
}

/** The place a ticket click is kept under, beside the request's own answers. */
export const TICKET_FIELD = 'request.ticket';

/** What the AI wrote, as far as answering a click goes. */
export type AiAnswer =
	| { readonly kind: 'reply'; readonly messageId: string }
	| { readonly kind: 'propose'; readonly fieldPath: string; readonly leafId: string | null }
	| { readonly kind: 'redraw'; readonly step: DrawableStep }
	| { readonly kind: 'report' };

/** Questions a section's prefill hands over at most: a section holds a few, never the whole dossier. */
const SECTION_MAX = 8;

/**
 * Whether a question is prefilled (ac-evo-live-prefill): every one, a step's
 * description first, but the requester's verbatim, which stays their own
 * words, and a diagram, which is drawn, not prefilled.
 */
export const prefillable = (fieldPath: string): boolean => fieldPath !== '00-need.description' && !fieldPath.endsWith('.diagram');

/** The questions a prefill covers: the one it bears on, then the rest of its section, each once. */
export function sectionOf(click: Pick<AiClick, 'fieldPath' | 'section'>): readonly string[] {
	return [...new Set([click.fieldPath, ...(click.section ?? [])])];
}

/** The refusal a person reads beside an AI button with no session of their own (ac-evo-live-no-session). */
export const NO_SESSION_SENTENCE = 'No session with your AI yet: a click copies the prompt that opens one.';
/** The refusal the MCP answers when the AI acts outside a session. */
export const NO_SESSION_FOR_AI = 'No session is open on this request: open one with start_evolution_session.';
/** What the AI reads once it asked the person something on the page with no session of its own (ac-evo-live-auto-session). */
export const ASKED_WITHOUT_SESSION =
	'You asked the person something they answer on the request page, and no session of yours is open on it, so their answer would not reach you: call start_evolution_session now, then await_evolution_event, before you hand them the link.';

/** Whether an operation asks the person something they answer on the request page: a suggestion's question, or a thread message that waits for their answer. */
export function asksOnThePage(op: Record<string, unknown>): boolean {
	const name = typeof op.op === 'string' && op.op ? op.op : op.kind;
	if (name === 'propose') return typeof op.question === 'string' && op.question.trim() !== '';
	if (name === 'post_on_field') return op.asks === true;
	return false;
}

/** The next steps of a request where the AI asked on the page without a session: opening one comes first (ac-evo-live-auto-session). */
export function sessionFirst<T extends { readonly then: readonly string[] }>(next: T): T {
	return next.then[0] === ASKED_WITHOUT_SESSION ? next : { ...next, then: [ASKED_WITHOUT_SESSION, ...next.then] };
}
/** Every act of the AI after the person cancelled, until it calls again (ac-evo-live-cancel). */
export const CANCELLED_FOR_AI = 'The person cancelled the request you were answering: what you wrote for it is undone. Call await_evolution_event.';
/** What the AI may not do while it is on a click, since no cancellation could undo it. */
export const UNDOABLE_ONLY = 'Finish the click first: while you are on it, what you write must stay undoable, and a freeze, a close or a deletion cannot be.';

/** Sessions and clicks kept per request: enough to read back, small enough for the section. */
const KEPT_SESSIONS = 20;
const KEPT_SETTLED_CLICKS = 50;

const same = (a: string, b: string) => personKey(a) === personKey(b);
const sessionsOf = (request: Pick<EvolutionRequest, 'liveSessions'>) => request.liveSessions ?? [];
const clicksOf = (request: Pick<EvolutionRequest, 'aiClicks'>) => request.aiClicks ?? [];

/** The person's open session on this request, if any. */
export function openSessionOf(request: Pick<EvolutionRequest, 'liveSessions'>, personId: string): LiveSession | null {
	return sessionsOf(request).find((s) => same(s.personId, personId) && !s.endedAt) ?? null;
}

/** The person's last session, open or ended, so a page can say why it ended. */
export function lastSessionOf(request: Pick<EvolutionRequest, 'liveSessions'>, personId: string): LiveSession | null {
	const mine = sessionsOf(request).filter((s) => same(s.personId, personId));
	return mine.length > 0 ? mine[mine.length - 1] : null;
}

/** The person's clicks still waiting or in the AI's hands, oldest first. */
export function pendingClicksOf(request: Pick<EvolutionRequest, 'aiClicks'>, personId: string): AiClick[] {
	return clicksOf(request).filter((c) => same(c.personId, personId) && (c.state === 'waiting' || c.state === 'taken'));
}

/** Settled clicks beyond the newest ones go, so the request does not grow with every session. */
function pruned(clicks: readonly AiClick[]): AiClick[] {
	const settled = clicks.filter((c) => c.state === 'answered' || c.state === 'withdrawn' || c.state === 'cancelled');
	if (settled.length <= KEPT_SETTLED_CLICKS) return [...clicks];
	const dropped = new Set(settled.slice(0, settled.length - KEPT_SETTLED_CLICKS).map((c) => c.id));
	return clicks.filter((c) => !dropped.has(c.id));
}

/** A click without its journal: once the AI is off it, what it wrote is the person's to validate or refuse. */
function settledClick(click: AiClick): AiClick {
	const rest = { ...click };
	delete (rest as { journal?: unknown }).journal;
	return rest;
}

/** What the AI had in hand goes back to waiting: a session that ends loses no click, and what the AI wrote for it stays. */
function giveBack(clicks: readonly AiClick[], personId: string): AiClick[] {
	return clicks.map((c) => {
		if (!same(c.personId, personId)) return c;
		if (c.state !== 'taken') return c.journal ? settledClick(c) : c;
		const rest = settledClick(c);
		delete (rest as { takenAt?: string }).takenAt;
		return { ...rest, state: 'waiting' };
	});
}

/** A session off any click: the turn is over. */
function offClick(session: LiveSession): LiveSession {
	const rest = { ...session };
	delete (rest as { currentClickId?: string }).currentClickId;
	delete (rest as { cancelledClickId?: string }).cancelledClickId;
	return rest;
}

function ended(sessions: readonly LiveSession[], personId: string, reason: SessionEndReason, at: string): LiveSession[] {
	return sessions.map((s) => (same(s.personId, personId) && !s.endedAt ? { ...offClick(s), endedAt: at, endReason: reason } : s));
}

export type SessionOutcome =
	| { readonly ok: true; readonly request: EvolutionRequest; readonly session: LiveSession; readonly replaced: LiveSession | null }
	| Refused;

/**
 * Open a session for the person who pasted the prompt (ac-evo-live-start). A
 * person holds one session per request: a second one ends the first, whose
 * waiting call answers that it was replaced (ac-evo-live-one-agent).
 */
export function startSession(request: EvolutionRequest, personId: string, id: string, at: string): SessionOutcome {
	const replaced = openSessionOf(request, personId);
	const session: LiveSession = { id, personId, startedAt: at };
	const sessions = [...ended(sessionsOf(request), personId, 'replaced', at), session];
	return {
		ok: true,
		replaced,
		session,
		request: {
			...request,
			liveSessions: sessions.slice(-KEPT_SESSIONS),
			aiClicks: giveBack(clicksOf(request), personId)
		}
	};
}

/** End the person's session, saying why (ac-evo-live-end). The clicks in hand go back to waiting. */
export function endSession(request: EvolutionRequest, personId: string, reason: SessionEndReason, at: string, sessionId?: string): SessionOutcome {
	const open = openSessionOf(request, personId);
	if (!open || (sessionId && open.id !== sessionId))
		return refuse('No session is open on this request.', 'The button only shows while a session is open.');
	return {
		ok: true,
		replaced: null,
		session: { ...open, endedAt: at, endReason: reason },
		request: {
			...request,
			liveSessions: ended(sessionsOf(request), personId, reason, at),
			aiClicks: giveBack(clicksOf(request), personId)
		}
	};
}

/**
 * Whether the person may send this click (rules of "Send a click to my AI"):
 * prefill and draw write, which a viewer cannot, and an ask is a comment, which
 * they can. A session is never required: without one of the person's own the
 * click waits for the session the copied prompt opens, which takes it first
 * (ac-evo-live-no-session), and no other member's session ever takes it.
 */
export function clickAllowed(kind: AiClickKind, canEdit: boolean): Guarded {
	if (kind === 'ticket') return guard(!canEdit, 'Only who may edit the request has the ticket told.', 'Posting on the ticket speaks for the team, which a viewer does not.');
	if (kind === 'build') return guard(!canEdit, 'Only who may edit the request hands the build to their AI.', 'The AI writes the code and syncs the index for the request, which a viewer does not.');
	if (kind === 'close') return guard(!canEdit, 'Only who may edit the request hands the close to their AI.', 'The AI merges, syncs the index or deletes the branch for the request, which a viewer does not.');
	return guard(!canEdit && kind !== 'ask', 'Only who may edit the request prefills or draws; you may still ask in the thread.', 'Prefill and Draw write proposals and diagrams, which a viewer cannot.');
}

export type ClickOutcome = { readonly ok: true; readonly request: EvolutionRequest; readonly click: AiClick } | Refused;

/** The person sends a click to their AI; it waits its turn (ac-evo-live-click-state). */
export function sendClick(request: EvolutionRequest, personId: string, input: ClickInput, canEdit: boolean, id: string, at: string): ClickOutcome {
	const allowed = firstRefusal(
		clickAllowed(input.kind, canEdit),
		guard(input.kind === 'ask' && !input.messageId, 'An ask needs the message it asks.', 'Ask my AI posts the message in the thread, then sends it.'),
		guard(input.kind === 'draw' && !input.step, 'A draw needs the step whose diagram to draw.', 'Draw with my AI sits on the diagram of the Functional or the Technical spec.'),
		guard(
			input.kind === 'ticket' && (!input.ticket?.key.trim() || !input.ticket.message.trim()),
			'A ticket click needs the ticket and the message.',
			'The closing block names the ticket and composes the message the AI posts on it.'
		),
		guard(input.kind === 'build' && !input.build?.brief.trim(), 'A build click needs the brief.', 'The Build step composes the brief of the frozen version the AI builds.'),
		guard(
			input.kind === 'close' && (!isCloseStep(input.close?.step) || !input.close?.brief.trim()),
			'A close click needs its step (merge, sync or branch) and its brief.',
			'What happens next composes the brief of the step the AI carries out.'
		)
	);
	if (!allowed.ok) return allowed;
	const click: AiClick = {
		id,
		personId,
		kind: input.kind,
		fieldPath: input.fieldPath,
		leafId: input.leafId,
		...(input.kind === 'prefill' && input.section?.length ? { section: input.section.filter(prefillable).slice(0, SECTION_MAX) } : {}),
		...(input.step ? { step: input.step } : {}),
		...(input.messageId ? { messageId: input.messageId } : {}),
		...(input.proposalId ? { proposalId: input.proposalId } : {}),
		...(input.kind === 'ticket' && input.ticket ? { ticket: { key: input.ticket.key.trim(), message: input.ticket.message.trim() } } : {}),
		...(input.kind === 'build' && input.build ? { build: { brief: input.build.brief.trim() } } : {}),
		...(input.kind === 'close' && input.close ? { close: { step: input.close.step, brief: input.close.brief.trim() } } : {}),
		at,
		state: 'waiting'
	};
	return { ok: true, click, request: { ...request, aiClicks: pruned([...clicksOf(request), click]) } };
}

/** Whether a step's texts and diagram are apart: a drawn diagram behind the texts, or a text behind the diagram; one never drawn is drawn on demand (EVO-013). */
const apart = (request: EvolutionRequest, step: PairedStep): boolean => drawnDiagramBehind(request, step) || textsBehindDiagram(request, step).length > 0;
/** What a write may move on a step: its texts and its diagram. */
const sidesOf = (request: EvolutionRequest, step: PairedStep): string =>
	JSON.stringify([pairedTexts(request, step), request.stepAnswers[step]?.[FUNCTIONAL_DIAGRAM_KEY] ?? '']);

/**
 * The texts of a step and its diagram follow each other in a session
 * (ac-evo-live-follow): a write that left them apart sends the person's AI the
 * Draw click of that step, once, which catches the other side up; a write that
 * puts them back in step takes back such a click still waiting. Nothing without
 * a session of the person's own: the card offers to catch it up.
 */
export function followUpClicks(before: EvolutionRequest, after: EvolutionRequest, personId: string, at: string, newId: () => string): EvolutionRequest {
	if (!openSessionOf(after, personId)) return after;
	let request = after;
	for (const step of PAIRED_STEPS) {
		if (sidesOf(before, step) === sidesOf(after, step)) continue;
		const pending = clicksOf(request).find((c) => same(c.personId, personId) && c.kind === 'draw' && c.step === step && (c.state === 'waiting' || c.state === 'taken'));
		if (!apart(request, step)) {
			if (pending?.follow && pending.state === 'waiting')
				request = { ...request, aiClicks: clicksOf(request).map((c) => (c.id === pending.id ? { ...c, state: 'withdrawn' as const } : c)) };
			continue;
		}
		if (pending) continue;
		const sent = sendClick(request, personId, { kind: 'draw', fieldPath: `step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`, leafId: null, step }, true, newId(), at);
		if (sent.ok) request = { ...sent.request, aiClicks: clicksOf(sent.request).map((c) => (c.id === sent.click.id ? { ...c, follow: true as const } : c)) };
	}
	return request;
}

/** The person takes back a click no AI has taken yet. */
export function withdrawClick(request: EvolutionRequest, personId: string, clickId: string): ClickOutcome {
	const click = clicksOf(request).find((c) => c.id === clickId && same(c.personId, personId) && c.state === 'waiting');
	if (!click) return refuse('No click waits for your AI here.', 'Withdraw only shows on a waiting click.');
	const withdrawn: AiClick = { ...click, state: 'withdrawn' };
	return { ok: true, click: withdrawn, request: { ...request, aiClicks: clicksOf(request).map((c) => (c.id === clickId ? withdrawn : c)) } };
}

/**
 * The oldest waiting click of the person, handed to their waiting call. Null
 * when nothing waits, when the AI still holds a click (a click made while it
 * thinks waits its turn), or when no session is open.
 */
export function takeNextClick(request: EvolutionRequest, personId: string, at: string): { readonly request: EvolutionRequest; readonly click: AiClick } | null {
	if (!openSessionOf(request, personId)) return null;
	const mine = clicksOf(request).filter((c) => same(c.personId, personId));
	if (mine.some((c) => c.state === 'taken')) return null;
	const next = mine.find((c) => c.state === 'waiting');
	if (!next) return null;
	const taken: AiClick = { ...next, state: 'taken', takenAt: at, journal: [] };
	return {
		click: taken,
		request: {
			...request,
			aiClicks: clicksOf(request).map((c) => (c.id === next.id ? taken : c)),
			// The AI is on this click until it calls again ("Hand the next click to the AI").
			liveSessions: sessionsOf(request).map((s) => (same(s.personId, personId) && !s.endedAt ? { ...offClick(s), currentClickId: taken.id } : s))
		}
	};
}

export type TurnClosed = { readonly request: EvolutionRequest; readonly cancelled: AiClick | null };

/**
 * Calling again ends the turn ("Wait for the next click"): the clicks the AI
 * had taken are answered, what it wrote for the click it was on is no longer
 * undoable by cancelling, and a cancellation the AI had not heard of yet is
 * handed back so the call can tell it.
 */
export function closeTurn(request: EvolutionRequest, personId: string, at: string): TurnClosed | null {
	const open = openSessionOf(request, personId);
	const holds = clicksOf(request).some((c) => same(c.personId, personId) && (c.state === 'taken' || c.journal));
	if (!holds && !open?.currentClickId && !open?.cancelledClickId) return null;
	const cancelled = open?.cancelledClickId ? (clicksOf(request).find((c) => c.id === open.cancelledClickId) ?? null) : null;
	return {
		cancelled,
		request: {
			...request,
			aiClicks: clicksOf(request).map((c) => {
				if (!same(c.personId, personId)) return c;
				// Let go of with nothing written for it, it reads so, never answered (ac-evo-live-click-state).
				if (c.state === 'taken') return { ...settledClick(c), state: 'answered', answeredAt: at, ...(c.journal?.length ? {} : { answeredNothing: true as const }) };
				return c.journal ? settledClick(c) : c;
			}),
			liveSessions: sessionsOf(request).map((s) => (same(s.personId, personId) && !s.endedAt ? offClick(s) : s))
		}
	};
}

/** Calling again means the clicks the AI had taken are answered ("Wait for the next click"). */
export function closeTakenClicks(request: EvolutionRequest, personId: string, at: string): EvolutionRequest | null {
	return closeTurn(request, personId, at)?.request ?? null;
}

/** The click the AI is on, from taking it until it calls again; null when it is on none or the person cancelled it. */
export function currentClickOf(request: Pick<EvolutionRequest, 'liveSessions' | 'aiClicks'>, personId: string): AiClick | null {
	const open = openSessionOf(request, personId);
	if (!open?.currentClickId) return null;
	return clicksOf(request).find((c) => c.id === open.currentClickId && c.state !== 'cancelled') ?? null;
}

/** Every act of the AI is refused between the person's cancellation and its next call (ac-evo-live-cancel). */
export function aiMayAct(request: Pick<EvolutionRequest, 'liveSessions'>, personId: string): Guarded {
	return guard(!!openSessionOf(request, personId)?.cancelledClickId, CANCELLED_FOR_AI, 'The person cancelled; the next await_evolution_event says what was undone.');
}

/** Fold what the AI just wrote into the journal of the click it is on; the request unchanged when it is on none. */
export function journalOnCurrentClick(
	request: EvolutionRequest,
	personId: string,
	changes: readonly JournalEntry[],
	afterRoots: Partial<Record<JournalSection, unknown>>
): EvolutionRequest {
	const current = currentClickOf(request, personId);
	if (!current || changes.length === 0) return request;
	const journal = mergeJournal(current.journal ?? [], changes, afterRoots);
	return { ...request, aiClicks: clicksOf(request).map((c) => (c.id === current.id ? { ...c, journal } : c)) };
}

export type CancelOutcome = { readonly ok: true; readonly click: AiClick; readonly journal: readonly JournalEntry[] } | Refused;

/** The click the person may cancel: the one their own AI is on (rules of "Cancel the request in progress"). */
export function cancellableClick(request: Pick<EvolutionRequest, 'liveSessions' | 'aiClicks'>, personId: string, clickId?: string): CancelOutcome {
	const current = currentClickOf(request, personId);
	if (!current || (clickId && current.id !== clickId))
		return refuse('Your AI is on no request of yours right now.', 'Cancel only shows while your own AI is on a click; a settled answer is refused version by version.');
	return { ok: true, click: current, journal: current.journal ?? [] };
}

/**
 * Mark the click cancelled once what the AI wrote for it was put back: it reads
 * cancelled where it was made, and the AI is refused until it calls again.
 */
export function markCancelled(
	request: EvolutionRequest,
	personId: string,
	clickId: string,
	cancellation: { readonly at: string; readonly undone: number; readonly kept: readonly string[] }
): EvolutionRequest {
	return {
		...request,
		aiClicks: clicksOf(request).map((c) => (c.id === clickId ? { ...settledClick(c), state: 'cancelled', cancellation } : c)),
		liveSessions: sessionsOf(request).map((s) => (same(s.personId, personId) && !s.endedAt ? { ...offClick(s), cancelledClickId: clickId } : s))
	};
}

/** The taken click an act of the AI answers, if any ("Record the AI's answer"). */
export function clickAnsweredBy(request: Pick<EvolutionRequest, 'aiClicks'>, personId: string, answer: AiAnswer): AiClick | null {
	return (
		clicksOf(request).find((c) => {
			if (!same(c.personId, personId) || c.state !== 'taken') return false;
			switch (answer.kind) {
				case 'reply':
					return c.kind === 'ask' && c.messageId === answer.messageId;
				case 'propose':
					// A proposal on any question of the section answers a section's prefill.
					return c.kind === 'prefill' && sectionOf(c).includes(answer.fieldPath) && (c.leafId ?? null) === answer.leafId;
				case 'redraw':
					return c.kind === 'draw' && c.step === answer.step;
				case 'report':
					return c.kind === 'build';
			}
		}) ?? null
	);
}

/** Mark the click an act of the AI answers; the request unchanged when it answers none. */
export function answerClick(request: EvolutionRequest, personId: string, answer: AiAnswer, at: string): { readonly request: EvolutionRequest; readonly click: AiClick | null } {
	const click = clickAnsweredBy(request, personId, answer);
	if (!click) return { request, click: null };
	const answered: AiClick = { ...click, state: 'answered', answeredAt: at };
	return { click: answered, request: { ...request, aiClicks: clicksOf(request).map((c) => (c.id === click.id ? answered : c)) } };
}

/** Seconds between two ISO instants, never negative. */
export const secondsBetween = (from: string, to: string): number => Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000);

/** What the request keeps of the person's own acts, each with its moment. */
type ActsOnRequest = Pick<EvolutionRequest, 'liveSessions' | 'aiClicks'> &
	Partial<Pick<EvolutionRequest, 'history' | 'fieldVersions' | 'fieldValidations' | 'stepValidations' | 'fieldThreads'>>;

/**
 * When the person last acted on the request: a click, a validation, a decision,
 * an answer or an edit, a crossing, a message. Only what is stamped as the
 * person's counts: the AI's own writes, what it validates under delegation
 * included, carry the AI's kind and never do.
 */
export function lastPersonActAt(request: ActsOnRequest, personId: string): string | null {
	const theirs = (by: string, kind: string) => kind === 'person' && same(by, personId);
	const moments = [
		...clicksOf(request).filter((c) => same(c.personId, personId)).map((c) => c.at),
		...(request.history ?? []).filter((h) => theirs(h.authorId, h.authorKind)).map((h) => h.recordedAt),
		...(request.fieldVersions ?? []).filter((v) => theirs(v.by, v.byKind)).map((v) => v.at),
		...(request.fieldValidations ?? []).filter((v) => theirs(v.by, v.byKind)).map((v) => v.at),
		...(request.stepValidations ?? []).flatMap((s) => s.validations.filter((v) => theirs(v.by, v.kind)).map((v) => v.at)),
		...(request.fieldThreads ?? []).flatMap((t) =>
			t.messages.filter((m) => theirs(m.author, m.authorKind)).map((m) => m.editedAt ?? m.postedAt)
		)
	];
	return moments.sort().pop() ?? null;
}

/**
 * Whether an open session has gone idle ("End an idle session"): neither the
 * person nor their AI did anything on the request for idleEndSeconds, counted
 * from the last act or from the opening (ac-evo-live-end). A person validating
 * steps on the page without pressing an AI button is there; an AI at work, its
 * last act given as `aiActedAt` (any call but a wait), is there too (criterion
 * 122ab5c8 of feat-ai-session).
 */
export function isIdle(request: ActsOnRequest, personId: string, now: string, aiActedAt: string | null = null): boolean {
	const open = openSessionOf(request, personId);
	if (!open) return false;
	const since = [open.startedAt, lastPersonActAt(request, personId), aiActedAt].filter((m): m is string => m !== null).sort().pop()!;
	return secondsBetween(since, now) >= LIVE_SESSION.idleEndSeconds;
}
