import { isAnchor } from './anchors';
import {
	DISCUSSIONS_VERSION,
	MAX_NOTIFIED,
	emptyDiscussions,
	type DiscussionAct,
	type DiscussionAuthor,
	type DiscussionMessage,
	type DiscussionRuling,
	type DiscussionThread,
	type DiscussionsDocument
} from './discussion';

/**
 * The edge of the discussions context: a stored document or a request body is
 * read field by field, and whatever does not have the expected shape is
 * dropped rather than trusted, so one damaged row never hides the others.
 */

type Raw = Record<string, unknown>;
const rec = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function author(v: unknown): DiscussionAuthor | null {
	const r = rec(v);
	const email = str(r.email).trim();
	if (!email) return null;
	return { email, name: str(r.name).trim() || email };
}

function message(v: unknown): DiscussionMessage | null {
	const r = rec(v);
	const by = author(r.author);
	const id = str(r.id);
	const text = str(r.text);
	if (!by || !id || !text) return null;
	return { id, author: by, at: str(r.at), text };
}

function ruling(v: unknown): DiscussionRuling | null {
	const r = rec(v);
	const by = author(r.by);
	const state = r.state === 'resolved' || r.state === 'reopened' ? r.state : null;
	if (!by || !state) return null;
	return { state, by, at: str(r.at) };
}

function thread(v: unknown): DiscussionThread | null {
	const r = rec(v);
	const id = str(r.id);
	const anchor = str(r.anchor);
	const messages = list(r.messages).map(message).filter((m): m is DiscussionMessage => m !== null);
	// A thread is its opening message: without one there is nothing to read.
	if (!id || !isAnchor(anchor) || messages.length === 0) return null;
	return {
		id,
		anchor,
		anchorTitle: str(r.anchorTitle),
		state: r.state === 'resolved' ? 'resolved' : 'open',
		notify: list(r.notify).map(str).filter(Boolean).slice(0, MAX_NOTIFIED),
		messages,
		rulings: list(r.rulings).map(ruling).filter((x): x is DiscussionRuling => x !== null)
	};
}

/** A stored document, or the empty one when nothing (or nothing readable) was stored. */
export function parseDiscussions(raw: unknown): DiscussionsDocument {
	if (raw === null || raw === undefined) return emptyDiscussions();
	const threads = list(rec(raw).threads)
		.map(thread)
		.filter((t): t is DiscussionThread => t !== null);
	return { version: DISCUSSIONS_VERSION, threads };
}

/** An act as the page sends it, or why it cannot be read. */
export function parseDiscussionAct(raw: unknown): { ok: true; act: DiscussionAct } | { ok: false; refusal: string } {
	const r = rec(raw);
	switch (r.kind) {
		case 'open': {
			const anchor = str(r.anchor);
			if (!isAnchor(anchor)) return { ok: false, refusal: 'This element cannot be discussed.' };
			return {
				ok: true,
				act: {
					kind: 'open',
					anchor,
					anchorTitle: str(r.anchorTitle),
					text: str(r.text),
					notify: list(r.notify).map(str).filter(Boolean)
				}
			};
		}
		case 'reply': {
			const threadId = str(r.threadId);
			if (!threadId) return { ok: false, refusal: 'Name the discussion to reply to.' };
			return { ok: true, act: { kind: 'reply', threadId, text: str(r.text) } };
		}
		case 'resolve':
		case 'reopen': {
			const threadId = str(r.threadId);
			if (!threadId) return { ok: false, refusal: 'Name the discussion.' };
			return { ok: true, act: { kind: r.kind, threadId } };
		}
		default:
			return { ok: false, refusal: 'Unknown discussion act.' };
	}
}
