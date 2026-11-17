import { getContext, setContext } from 'svelte';
import { invalidate } from '$app/navigation';
import { navigating } from '$app/state';
import { pushToast } from '$ui/design-system';
import { clientId } from '$ui/shell/live-sync.client';
import { refusalOf } from '$ui/shell/save-queue';
import { sectionSyncKey } from '$lib/shared/section-sync';
import {
	RETROSPEC_SECTION,
	applyRetrospecActs,
	currentRun,
	isHandled,
	itemState,
	type ItemComment,
	type ItemFlag,
	type ItemState,
	type PersonRef,
	type RetroItem,
	type RetrospecAct,
	type RetrospecDocument,
	type RetrospecRun
} from '$domain/retrospec';

/**
 * The review on the page: what each item reads (who validated it, its flag,
 * its comments) and the acts a person sends. An act reads on the page the
 * moment it is clicked, applied by the same domain rules the server applies,
 * and stays applied until the page has read the saved document back; a
 * refusal takes it back out and says why.
 */

export interface ItemView {
	readonly state: ItemState;
	readonly handled: boolean;
	readonly validators: readonly PersonRef[];
	readonly mine: boolean;
	readonly flag: ItemFlag | null;
	readonly comments: readonly ItemComment[];
	/** Comments nobody resolved yet. */
	readonly open: number;
}

/** What the page hands the review: everything it reads comes from the page's data. */
export interface ReviewSource {
	readonly projectId: string;
	readonly me: PersonRef;
	readonly run: RetrospecRun | null;
	readonly comments: RetrospecDocument['comments'];
	/** How many items the review holds, sent along so the status counts "N / M". */
	readonly total: number;
	readonly canWrite: boolean;
	/** The people an item can be shared with, the reader aside. */
	readonly members: readonly (PersonRef & { readonly job: string })[];
}

/**
 * Send acts to the project's retrospecification; true once saved and read
 * back. A refusal says what was not saved (`what`) and the server's reason.
 */
export async function sendRetrospecActs(projectId: string, acts: readonly Record<string, unknown>[], what = 'Your change'): Promise<boolean> {
	let res: Response;
	try {
		res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/retrospec`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-lyriks-client': clientId },
			body: JSON.stringify({ acts })
		});
	} catch {
		pushToast({ level: 'error', message: `${what} was not saved. Check your connection.` });
		return false;
	}
	if (!res.ok) {
		pushToast({ level: 'error', message: `${what} was not saved. ${await refusalOf(res, 'The change failed')}` });
		return false;
	}
	// Our own write never echoes back on the live stream: read it ourselves, once a
	// navigation started meanwhile has landed (opening the Specification 360° sends
	// its act and leaves at once): an invalidation would cancel it and reload this page.
	await navigating.complete?.catch(() => {});
	await invalidate(sectionSyncKey(projectId, RETROSPEC_SECTION));
	return true;
}

let sequence = 0;

export class RetroReview {
	readonly #source: () => ReviewSource;
	#pending = $state<{ readonly id: number; readonly acts: readonly RetrospecAct[] }[]>([]);
	/** The item whose comments are open, and the one whose "Not sure…" menu is. */
	commentsOpen = $state<string | null>(null);
	menuOpen = $state<string | null>(null);

	constructor(source: () => ReviewSource) {
		this.#source = source;
	}

	get source(): ReviewSource {
		return this.#source();
	}

	get members(): ReviewSource['members'] {
		return this.#source().members;
	}

	/** The document as the page shows it: the saved one, then the acts still on their way. */
	readonly doc = $derived.by((): RetrospecDocument => {
		const { run, comments, me } = this.#source();
		const saved: RetrospecDocument = { version: 1, runs: run ? [run] : [], comments };
		const acts = this.#pending.flatMap((p) => p.acts);
		if (acts.length === 0) return saved;
		const outcome = applyRetrospecActs(saved, acts, { actor: me, now: new Date().toISOString() });
		return outcome.ok ? outcome.doc : saved;
	});

	readonly run = $derived(currentRun(this.doc));

	view(itemId: string): ItemView {
		const verdict = this.run?.verdicts[itemId];
		const state = itemState(verdict);
		const me = this.#source().me.id.trim().toLowerCase();
		const validators = (verdict?.validatedBy ?? []).map((v) => v.person);
		const comments = this.doc.comments[itemId] ?? [];
		return {
			state,
			handled: isHandled(state),
			validators,
			mine: validators.some((p) => p.id.trim().toLowerCase() === me),
			flag: verdict?.flag ?? null,
			comments,
			open: comments.filter((c) => !c.resolved).length
		};
	}

	/** Apply acts at once on the page, then save them; a refusal takes them back. */
	async act(acts: RetrospecAct[]): Promise<boolean> {
		const source = this.#source();
		if (!source.canWrite) {
			pushToast({ level: 'info', message: 'You can read this review, not act on it: ask a project editor.' });
			return false;
		}
		const id = ++sequence;
		this.#pending = [...this.#pending, { id, acts }];
		try {
			return await sendRetrospecActs(source.projectId, acts as unknown as Record<string, unknown>[]);
		} finally {
			this.#pending = this.#pending.filter((p) => p.id !== id);
		}
	}

	#about(item: RetroItem) {
		return { itemId: item.id, title: item.title, tab: item.tab, total: this.#source().total };
	}

	validate(item: RetroItem) {
		this.menuOpen = null;
		return this.act([{ op: 'validate', ...this.#about(item) }]);
	}
	withdraw(item: RetroItem) {
		return this.act([{ op: 'withdraw', itemId: item.id, total: this.#source().total }]);
	}
	toggleReject(item: RetroItem) {
		const rejected = this.view(item.id).state === 'rejected';
		if (rejected) {
			pushToast({ level: 'success', message: 'Element restored' });
			return this.act([{ op: 'clear_flag', itemId: item.id, total: this.#source().total }]);
		}
		pushToast({ level: 'info', message: 'Marked as not wanted: it is flagged for removal from the specification' });
		return this.act([{ op: 'reject', ...this.#about(item) }]);
	}
	setAside(item: RetroItem) {
		this.menuOpen = null;
		pushToast({ level: 'info', message: `“${item.title}” set aside for later` });
		return this.act([{ op: 'set_aside', ...this.#about(item) }]);
	}
	share(item: RetroItem, to: PersonRef) {
		this.menuOpen = null;
		pushToast({ level: 'info', message: `“${item.title}” shared with ${to.name}` });
		return this.act([{ op: 'share', ...this.#about(item), to }]);
	}
	comment(item: RetroItem, text: string) {
		const commentId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		return this.act([{ op: 'comment', itemId: item.id, commentId, text }]);
	}
	resolve(item: RetroItem, commentId: string) {
		return this.act([{ op: 'resolve_comment', itemId: item.id, commentId }]);
	}
	toggleComments(itemId: string) {
		this.commentsOpen = this.commentsOpen === itemId ? null : itemId;
	}
	toggleMenu(itemId: string) {
		this.menuOpen = this.menuOpen === itemId ? null : itemId;
	}
}

const KEY = Symbol('retro-review');
export const provideReview = (review: RetroReview) => setContext(KEY, review);
export const useReview = () => getContext<RetroReview>(KEY);
