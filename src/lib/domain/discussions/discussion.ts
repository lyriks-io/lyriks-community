import { isAnchor } from './anchors';

/**
 * Discussions on the Specification 360°: colleagues talk about one element of
 * the spec where it is shown (the problem, a rule, a role, a glossary term...).
 * A discussion never changes the spec; it is a conversation next to it, so it
 * is open (someone is waiting) or resolved, and either can be turned back.
 *
 * Every element may hold several threads. A thread is opened with a first
 * message and the people it notifies, takes replies, and is resolved or
 * reopened by a person; nothing is ever deleted, a resolved thread stays
 * readable. Pure: ids and instants are handed in by the caller.
 */

export const DISCUSSIONS_VERSION = 1;
/** A message is a remark, never a document. */
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TITLE_LENGTH = 200;
/** A thread notifies a handful of colleagues, never the whole company. */
export const MAX_NOTIFIED = 30;

/** Who wrote: the identity the session gives (an email, or the local operator id) and the name the app shows. */
export interface DiscussionAuthor {
	readonly email: string;
	readonly name: string;
}

/** An AI client answers in a thread under this prefix and its own id, so the thread knows the AI takes part in it. */
export const AI_AUTHOR_PREFIX = 'ai:';
export const isAiAuthor = (author: DiscussionAuthor): boolean => author.email.startsWith(AI_AUTHOR_PREFIX);

/**
 * The AI signing its answer to a person's question as Lyriks's work (criterion
 * ccaa0784): "Lyriks · for <name>", the
 * name being the one the question already reads under in the thread, so one
 * person never shows under two names there; else the name the roster gives,
 * never the bare id when a name exists (ac-ai-session-ask-block).
 */
export function aiAnswerAuthor(personId: string, question: Pick<DiscussionMessage, 'author'> | undefined, rosterName?: string): DiscussionAuthor {
	const asked = question && question.author.email === personId ? question.author.name.trim() : '';
	return { email: `${AI_AUTHOR_PREFIX}${personId}`, name: `Lyriks · for ${asked || rosterName?.trim() || personId}` };
}

export interface DiscussionMessage {
	readonly id: string;
	readonly author: DiscussionAuthor;
	/** ISO 8601. */
	readonly at: string;
	readonly text: string;
}

/** A person resolving or reopening a thread, kept so the history and the notifications can say who and when. */
export interface DiscussionRuling {
	readonly state: 'resolved' | 'reopened';
	readonly by: DiscussionAuthor;
	readonly at: string;
}

export type DiscussionState = 'open' | 'resolved';

export interface DiscussionThread {
	readonly id: string;
	/** The spec element discussed (see anchors.ts). */
	readonly anchor: string;
	/** What the element was called when the thread opened, so a notification reads without the spec. */
	readonly anchorTitle: string;
	readonly state: DiscussionState;
	/** The colleagues the opener asked to notify, by email. */
	readonly notify: readonly string[];
	/** The opening message first, then the replies in order. */
	readonly messages: readonly DiscussionMessage[];
	readonly rulings: readonly DiscussionRuling[];
}

export interface DiscussionsDocument {
	readonly version: typeof DISCUSSIONS_VERSION;
	readonly threads: readonly DiscussionThread[];
}

export function emptyDiscussions(): DiscussionsDocument {
	return { version: DISCUSSIONS_VERSION, threads: [] };
}

/** What a person does in a discussion, as the page asks it. */
export type DiscussionAct =
	| {
			readonly kind: 'open';
			readonly anchor: string;
			readonly anchorTitle: string;
			readonly text: string;
			readonly notify: readonly string[];
	  }
	| { readonly kind: 'reply'; readonly threadId: string; readonly text: string }
	| { readonly kind: 'resolve'; readonly threadId: string }
	| { readonly kind: 'reopen'; readonly threadId: string };

/** The ids and the instant an act needs, chosen by the caller so the domain stays pure. */
export interface ActContext {
	readonly author: DiscussionAuthor;
	readonly at: string;
	/** Used when the act opens a thread. */
	readonly threadId: string;
	/** Used when the act writes a message. */
	readonly messageId: string;
}

export type ActOutcome =
	| { readonly ok: true; readonly document: DiscussionsDocument; readonly thread: DiscussionThread }
	| { readonly ok: false; readonly refusal: string };

const refuse = (refusal: string): ActOutcome => ({ ok: false, refusal });

/** An email-shaped identity, compared case aside. */
const normalEmail = (value: string): string => value.trim().toLowerCase();

function textRefusal(text: string): string | null {
	if (text.trim() === '') return 'Write your message first.';
	if (text.length > MAX_MESSAGE_LENGTH) return `A message holds at most ${MAX_MESSAGE_LENGTH} characters.`;
	return null;
}

/** The notified colleagues, each once, never the author, never more than the cap. */
export function cleanNotify(notify: readonly string[], authorEmail: string): string[] {
	const self = normalEmail(authorEmail);
	const out: string[] = [];
	for (const raw of notify) {
		const email = normalEmail(raw);
		if (email === '' || email === self || out.includes(email)) continue;
		out.push(email);
	}
	return out.slice(0, MAX_NOTIFIED);
}

/** Apply one act; the document is never mutated. */
export function applyDiscussionAct(
	document: DiscussionsDocument,
	act: DiscussionAct,
	ctx: ActContext
): ActOutcome {
	if (ctx.author.email.trim() === '') return refuse('A message cannot be posted without an author.');
	switch (act.kind) {
		case 'open':
			return open(document, act, ctx);
		case 'reply':
			return reply(document, act, ctx);
		case 'resolve':
			return rule(document, act.threadId, 'resolved', ctx);
		case 'reopen':
			return rule(document, act.threadId, 'reopened', ctx);
	}
}

function open(
	document: DiscussionsDocument,
	act: Extract<DiscussionAct, { kind: 'open' }>,
	ctx: ActContext
): ActOutcome {
	if (!isAnchor(act.anchor)) return refuse('This element cannot be discussed.');
	const bad = textRefusal(act.text);
	if (bad) return refuse(bad);
	if (document.threads.some((t) => t.id === ctx.threadId)) return refuse('This discussion already exists.');
	const thread: DiscussionThread = {
		id: ctx.threadId,
		anchor: act.anchor,
		anchorTitle: act.anchorTitle.trim().slice(0, MAX_TITLE_LENGTH),
		state: 'open',
		notify: cleanNotify(act.notify, ctx.author.email),
		messages: [{ id: ctx.messageId, author: ctx.author, at: ctx.at, text: act.text.trim() }],
		rulings: []
	};
	return { ok: true, document: { ...document, threads: [...document.threads, thread] }, thread };
}

function reply(
	document: DiscussionsDocument,
	act: Extract<DiscussionAct, { kind: 'reply' }>,
	ctx: ActContext
): ActOutcome {
	const bad = textRefusal(act.text);
	if (bad) return refuse(bad);
	const current = document.threads.find((t) => t.id === act.threadId);
	if (!current) return refuse('This discussion no longer exists.');
	const message: DiscussionMessage = { id: ctx.messageId, author: ctx.author, at: ctx.at, text: act.text.trim() };
	return replaced(document, { ...current, messages: [...current.messages, message] });
}

/** Resolving an open thread or reopening a resolved one; asking for the state it already has is refused. */
function rule(
	document: DiscussionsDocument,
	threadId: string,
	state: DiscussionRuling['state'],
	ctx: ActContext
): ActOutcome {
	const current = document.threads.find((t) => t.id === threadId);
	if (!current) return refuse('This discussion no longer exists.');
	const target: DiscussionState = state === 'resolved' ? 'resolved' : 'open';
	if (current.state === target) {
		return refuse(target === 'resolved' ? 'This discussion is already resolved.' : 'This discussion is already open.');
	}
	const ruling: DiscussionRuling = { state, by: ctx.author, at: ctx.at };
	return replaced(document, { ...current, state: target, rulings: [...current.rulings, ruling] });
}

function replaced(document: DiscussionsDocument, thread: DiscussionThread): ActOutcome {
	return {
		ok: true,
		document: { ...document, threads: document.threads.map((t) => (t.id === thread.id ? thread : t)) },
		thread
	};
}

/* ── Reading ──────────────────────────────────────────────────────────── */

/** The threads held on one element, oldest first. */
export function threadsOn(document: DiscussionsDocument, anchor: string): DiscussionThread[] {
	return document.threads.filter((t) => t.anchor === anchor);
}

/** How many threads an element holds and how many still wait for an answer. */
export function anchorTally(document: DiscussionsDocument, anchor: string): { total: number; open: number } {
	const threads = threadsOn(document, anchor);
	return { total: threads.length, open: threads.filter((t) => t.state === 'open').length };
}

/** Every open thread of the project: what the Home counts as waiting. */
export function openDiscussionCount(document: DiscussionsDocument): number {
	return document.threads.filter((t) => t.state === 'open').length;
}

/**
 * Everyone a thread concerns: who opened it, who it notified and who replied,
 * each once, in the order they joined. Who resolved or reopened it only acted
 * on it, so they join only through a message.
 */
export function participantsOf(thread: DiscussionThread): string[] {
	const out: string[] = [];
	const add = (email: string) => {
		const e = normalEmail(email);
		if (e && !out.includes(e)) out.push(e);
	};
	const [opener, ...replies] = thread.messages;
	if (opener) add(opener.author.email);
	thread.notify.forEach(add);
	replies.forEach((m) => add(m.author.email));
	return out;
}
