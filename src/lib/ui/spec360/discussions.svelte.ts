import { scrollMotion } from '$ui/shell/scroll-motion';
import { getContext, setContext } from 'svelte';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { SaveQueue, refusalOf } from '$ui/shell/save-queue';
import { resolvedAct, shownDiscussions, type PendingDiscussionAct } from './discussion-overlay';
import {
	anchorDomId,
	anchorTally,
	threadsOn,
	type ActContext,
	type DiscussionAct,
	type DiscussionAuthor,
	type DiscussionThread,
	type DiscussionsDocument
} from '$domain/discussions';

/** A colleague a thread can notify, as the server names them. */
export interface RosterPerson {
	readonly email: string;
	readonly name: string;
	readonly job: string;
}

type Sent = { readonly ok: true; readonly threadId: string; readonly messageId: string } | { readonly ok: false; readonly reason: string };

/** A message just posted: where it is, so it can be handed to the reader's AI (ac-ai-session-ask-block). */
export interface Posted {
	readonly threadId: string;
	readonly messageId: string;
	readonly text: string;
}

let sequence = 0;

/**
 * The page side of the Specification 360° discussions: the document the
 * layout loaded, which element's panel is open, what is being typed, and the
 * acts sent to the server. An act reads in its thread the moment it is sent
 * (applied by the same domain rules the server applies) and is saved behind,
 * one after the other; the server answers with the document as it now
 * stands, which replaces the local one in the same tick the act leaves, and a
 * refusal takes the act back out, gives the person their text back and says
 * why. Other tabs learn of the change through the live-sync bus and reload it.
 */
export class SpecDiscussions {
	#saved = $state<DiscussionsDocument>({ version: 1, threads: [] });
	revision = $state(0);
	#pending = $state<(PendingDiscussionAct & { readonly id: number })[]>([]);
	/** A thread opened here: the id it reads under until saved, to the one the server gave it. */
	#ids = $state<Record<string, string>>({});
	readonly #queue = new SaveQueue();
	/** The element whose discussion panel is open; one at a time. */
	openAnchor = $state<string | null>(null);
	/** What is typed for a new thread, per element. */
	drafts = $state<Record<string, string>>({});
	/** Who a new thread will notify, per element. */
	picked = $state<Record<string, string[]>>({});
	/** The thread whose reply box is open, and what is typed in it. */
	replyingTo = $state<string | null>(null);
	replyDraft = $state('');
	/**
	 * The conversation a link asked for, with the message it names, until its block's comments show it: they
	 * unfold it, scroll it to the middle of the window and mark it, then clear this (criterion 0bdc1d4f).
	 */
	landing = $state<{ readonly threadId: string; readonly messageId: string | null } | null>(null);

	constructor(
		readonly projectId: string,
		readonly me: DiscussionAuthor,
		readonly roster: readonly RosterPerson[],
		initial: { document: DiscussionsDocument; revision: number }
	) {
		this.#saved = initial.document;
		this.revision = initial.revision;
	}

	/** The document as the page shows it: the saved one, then the acts on their way. */
	readonly document = $derived(shownDiscussions(this.#saved, this.#pending, this.#ids));

	/** A reload brought the document again: keep whichever is newer. */
	hydrate(next: { document: DiscussionsDocument; revision: number }) {
		if (next.revision >= this.revision) {
			this.#saved = next.document;
			this.revision = next.revision;
		}
	}

	threads(anchor: string): DiscussionThread[] {
		return threadsOn(this.document, anchor);
	}

	tally(anchor: string) {
		return anchorTally(this.document, anchor);
	}

	toggle(anchor: string) {
		this.openAnchor = this.openAnchor === anchor ? null : anchor;
		this.replyingTo = null;
	}

	/** The colleagues a mention being typed (`@ca`) can name: first name or any word of the name. */
	mentionCandidates(anchor: string): { query: string; people: RosterPerson[] } | null {
		const match = /(^|\s)@([^\s@]*)$/.exec(this.drafts[anchor] ?? '');
		if (!match) return null;
		const query = match[2].toLowerCase();
		const me = this.me.email.toLowerCase();
		const people = this.roster.filter(
			(p) => p.email !== me && (p.name.toLowerCase().startsWith(query) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query)))
		);
		return { query, people };
	}

	/** Put the person picked in the message and in the people the thread notifies. */
	pickMention(anchor: string, person: RosterPerson) {
		this.drafts[anchor] = (this.drafts[anchor] ?? '').replace(/@([^\s@]*)$/, `@${person.name} `);
		const now = this.picked[anchor] ?? [];
		if (!now.includes(person.email)) this.picked[anchor] = [...now, person.email];
	}

	/** Open an element's panel and bring it into view (a link, the Discussions list). */
	reveal(anchor: string) {
		this.openAnchor = anchor;
		requestAnimationFrame(() =>
			document.getElementById(anchorDomId(anchor))?.scrollIntoView({ behavior: scrollMotion(), block: 'center' })
		);
	}

	/**
	 * Follow a link to one conversation (criterion 0bdc1d4f): its block's comments open and land on it, on the message
	 * named when there is one. A conversation the page no longer holds leaves the page at its block, unmarked.
	 */
	revealThread(threadId: string, messageId: string | null = null) {
		const thread = this.document.threads.find((t) => t.id === threadId);
		if (!thread) {
			this.landing = null;
			return;
		}
		this.openAnchor = thread.anchor;
		this.landing = { threadId, messageId };
	}

	personName(email: string): string {
		return this.roster.find((p) => p.email === email.toLowerCase())?.name ?? email;
	}

	jobOf(email: string): string {
		return this.roster.find((p) => p.email === email.trim().toLowerCase())?.job ?? '';
	}

	/**
	 * Post a new message on an element: it reads in the thread at once; a
	 * refusal puts the text back in the box. Answers what was posted, so it can
	 * be handed to the reader's AI (ac-ai-session-ask-block).
	 */
	async post(anchor: string, anchorTitle: string, quiet = false): Promise<Posted | null> {
		const typed = this.drafts[anchor] ?? '';
		const text = typed.trim();
		if (!text) {
			pushToast({ level: 'info', message: 'Write your message first' });
			return null;
		}
		const notify = this.picked[anchor] ?? [];
		this.drafts[anchor] = '';
		this.picked[anchor] = [];
		const sent = await this.#send({ kind: 'open', anchor, anchorTitle, text, notify });
		if (!sent.ok) {
			if (!this.drafts[anchor]) this.drafts[anchor] = typed;
			if (!this.picked[anchor]?.length) this.picked[anchor] = [...notify];
			pushToast({ level: 'error', message: `Your message was not posted. ${sent.reason}` });
			return null;
		}
		if (!quiet)
			pushToast({
				level: 'success',
				message: notify.length ? `Discussion opened · ${notify.map((e) => this.personName(e)).join(', ')} notified` : 'Comment posted'
			});
		return { threadId: sent.threadId, messageId: sent.messageId, text };
	}

	/** Reply to a thread: the reply reads under it at once and the box closes; a refusal reopens it on the text. */
	async reply(thread: DiscussionThread): Promise<Posted | null> {
		const typed = this.replyDraft;
		const text = typed.trim();
		if (!text) {
			pushToast({ level: 'info', message: 'Write your reply first' });
			return null;
		}
		this.replyDraft = '';
		this.replyingTo = null;
		const sent = await this.#send({ kind: 'reply', threadId: thread.id, text });
		if (!sent.ok) {
			if (this.replyingTo === null && !this.replyDraft) {
				this.replyingTo = this.#ids[thread.id] ?? thread.id;
				this.replyDraft = typed;
			}
			pushToast({ level: 'error', message: `Your reply was not sent. ${sent.reason}` });
			return null;
		}
		// The reply shows in the thread it answers, so it raises no message (criterion 8b431894).
		return { threadId: sent.threadId, messageId: sent.messageId, text };
	}

	/** Resolve an open thread or reopen a resolved one: it reads so at once. */
	async rule(thread: DiscussionThread) {
		const reopening = thread.state === 'resolved';
		const sent = await this.#send({ kind: reopening ? 'reopen' : 'resolve', threadId: thread.id });
		if (!sent.ok) return pushToast({ level: 'error', message: `The discussion was not ${reopening ? 'reopened' : 'resolved'}. ${sent.reason}` });
		pushToast({ level: 'success', message: reopening ? 'Discussion reopened' : 'Discussion resolved' });
	}

	async #send(act: DiscussionAct): Promise<Sent> {
		const id = ++sequence;
		const ctx: ActContext = { author: this.me, at: new Date().toISOString(), threadId: `local-${id}`, messageId: `local-${id}-m` };
		this.#pending = [...this.#pending, { id, act, ctx }];
		const sent = await this.#queue.run(() => this.#post(resolvedAct(act, this.#ids)));
		// The saved document and the act leave together: the thread never reads twice, nor blinks out.
		if (sent.ok) {
			this.#saved = sent.document;
			this.revision = sent.revision ?? this.revision;
			if (act.kind === 'open') {
				this.#ids = { ...this.#ids, [ctx.threadId]: sent.threadId };
				if (this.replyingTo === ctx.threadId) this.replyingTo = sent.threadId;
			}
		}
		this.#pending = this.#pending.filter((p) => p.id !== id);
		if (!sent.ok) return sent;
		// The message just written is the last of its thread in the saved document.
		const messageId = sent.document.threads.find((t) => t.id === sent.threadId)?.messages.at(-1)?.id ?? '';
		return { ok: true, threadId: sent.threadId, messageId };
	}

	async #post(act: DiscussionAct): Promise<{ ok: true; document: DiscussionsDocument; revision?: number; threadId: string } | { ok: false; reason: string }> {
		let res: Response;
		try {
			res = await fetch(`/projects/${encodeURIComponent(this.projectId)}/spec/discussions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
				body: JSON.stringify({ act })
			});
		} catch {
			return { ok: false, reason: 'Check your connection.' };
		}
		if (!res.ok) return { ok: false, reason: await refusalOf(res, 'The discussion could not be saved') };
		const body = (await res.json().catch(() => ({}))) as { document?: DiscussionsDocument; revision?: number; threadId?: string };
		if (!body.document) return { ok: false, reason: 'The server did not answer with the discussion.' };
		return { ok: true, document: body.document, revision: body.revision, threadId: body.threadId ?? '' };
	}
}

const KEY = Symbol('spec360-discussions');

export function provideDiscussions(store: SpecDiscussions): SpecDiscussions {
	return setContext(KEY, store);
}

export function useDiscussions(): SpecDiscussions {
	return getContext<SpecDiscussions>(KEY);
}
