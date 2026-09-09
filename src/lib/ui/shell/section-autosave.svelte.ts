import type { Session, ToastNotifierPort } from '$application/ports';
import { invalidate } from '$app/navigation';
import { projectSyncKey } from '$lib/shared/section-sync';
import { clientId } from '$ui/shell/live-sync.client';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

export type SaveStatus = 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 700;

export interface SectionAutosaveOptions<TDraft> {
	/** `PUT` target, e.g. `/api/draft/foundation/operations`. */
	endpoint: string;
	session: Session;
	notifier: ToastNotifierPort;
	/** The current draft — serialized as the save body (must carry projectId). */
	getDraft: () => TDraft;
	/** Replace the store's draft with a server-loaded one (hydration). */
	applyRemote: (draft: TDraft) => void;
	/** Post-save hook — stores typically stamp `draft.lastSavedAt` here. */
	onSaved?: (savedAt: string, response: Record<string, unknown>) => void;
	/** Revision the initial draft was loaded at. */
	revision?: number;
}

/** SvelteKit's error envelope — `{ message }` — read defensively. */
async function readErrorMessage(res: Response): Promise<string | null> {
	const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
	const message = typeof body?.message === 'string' ? body.message.trim() : '';
	return message.length > 0 ? message : null;
}

/**
 * Shared, lossless section autosave protocol. Dirty state is independent from
 * display status, and at most one PUT may be in flight. If the user edits while
 * a request is pending, the drain loop sends the newer snapshot immediately
 * after the first response with the newly issued revision.
 *
 * A genuine 409 never reloads over local work. The draft remains in memory and
 * the store stays in an explicit conflict state until a deliberate hydration or
 * retry resolves it.
 */
export class SectionAutosave<TDraft> {
	status = $state<SaveStatus>('saved');
	lastError = $state<string | null>(null);

	readonly #opts: SectionAutosaveOptions<TDraft>;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#rev: number;
	#lastHydrated: TDraft;
	#pendingRemote: { draft: TDraft; revision: number } | null = null;
	#dirtyVersion = 0;
	#savedVersion = 0;
	#forceSave = false;
	#flushPromise: Promise<void> | null = null;

	constructor(options: SectionAutosaveOptions<TDraft>) {
		this.#opts = options;
		this.#rev = options.revision ?? 0;
		this.#lastHydrated = options.getDraft();
	}

	/** The revision custom server actions must present and then replace. */
	get revision(): number {
		return this.#rev;
	}

	/** Adopt a server-loaded draft unless unsaved local work must be preserved. */
	hydrate = (incoming: TDraft, revision = 0) => {
		if (incoming === this.#lastHydrated) return;
		this.#lastHydrated = incoming;
		if (this.#isDirty() || this.#flushPromise || this.lastError === 'conflict') {
			this.#pendingRemote = { draft: incoming, revision };
			return;
		}
		if (revision < this.#rev) return;
		this.#pendingRemote = null;
		this.#rev = revision;
		this.lastError = null;
		this.status = 'saved';
		this.#opts.applyRemote(incoming);
	};

	/**
	 * Adopt the authoritative result of a custom mutation endpoint (capture,
	 * gateway pull/push, generation) and its returned revision.
	 */
	adoptSaved = (incoming: TDraft, revision: number) => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#pendingRemote = null;
		this.#lastHydrated = incoming;
		this.#rev = revision;
		this.#dirtyVersion = 0;
		this.#savedVersion = 0;
		this.lastError = null;
		this.status = 'saved';
		this.#opts.applyRemote(incoming);
	};

	/** Mark the draft dirty and (re)arm the debounced save. */
	touch = () => {
		if (!this.#opts.session.isAuthenticated) throw new Error('blocked: unauthenticated session');
		this.#dirtyVersion += 1;
		this.status = 'saving';
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.#ensureFlush();
		}, AUTOSAVE_DELAY_MS);
	};

	/** Save immediately (tab close, navigation, explicit action). */
	flushNow = async () => {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#forceSave = true;
		await this.#ensureFlush();
	};

	#isDirty = () => this.#dirtyVersion > this.#savedVersion;

	#ensureFlush = (): Promise<void> => {
		if (!this.#flushPromise) {
			this.#flushPromise = this.#drain().finally(() => {
				this.#flushPromise = null;
			});
		}
		return this.#flushPromise;
	};

	#drain = async () => {
		while (this.#forceSave || this.#isDirty()) {
			this.#forceSave = false;
			const savingVersion = this.#dirtyVersion;
			const saved = await this.#saveOnce();
			if (!saved) return;
			this.#savedVersion = Math.max(this.#savedVersion, savingVersion);
		}

		this.status = 'saved';
		this.lastError = null;
		this.#reconcilePendingRemote();
	};

	#saveOnce = async (): Promise<boolean> => {
		this.status = 'saving';
		try {
			const res = await fetch(this.#opts.endpoint, {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					'x-lyriks-client': clientId,
					[REVISION_HEADER]: String(this.#rev)
				},
				body: JSON.stringify(this.#opts.getDraft())
			});
			if (res.status === 409) {
				this.status = 'error';
				this.lastError = 'conflict';
				this.#opts.notifier.notify(
					'error',
					'This section changed elsewhere. Your local edits are preserved; reload when you are ready to resolve the conflict.'
				);
				return false;
			}
			// A rejected write is almost always something the author can fix (a field
			// at the wrong altitude, an unsupported item shape) and the server says
			// exactly what — surfacing a bare status code left the user stuck with a
			// section that silently stopped saving.
			if (!res.ok) {
				const reason = await readErrorMessage(res);
				if (reason) this.#opts.notifier.notify('error', reason);
				throw new Error(reason ?? `save failed (${res.status})`);
			}
			const payload = (await res.json()) as { savedAt: string; revision: number };
			if (!Number.isInteger(payload.revision) || payload.revision < 0) {
				throw new Error('save failed (invalid revision response)');
			}
			this.#rev = payload.revision;
			this.#opts.onSaved?.(payload.savedAt, payload);
			// The change event the server publishes skips the writer (it would echo
			// its own edit), so the writer's chrome (rings, Control Center) used to
			// stay stale until the next navigation. Re-read it here: a fix made in
			// front of someone moves the score while they watch.
			const projectId = (this.#opts.getDraft() as { projectId?: unknown }).projectId;
			if (typeof projectId === 'string' && projectId) {
				// Best-effort: outside a page context (tests, a detached store) there is
				// nothing to re-read, and that must never turn a landed save into an error.
				try {
					void invalidate(projectSyncKey(projectId)).catch(() => {});
				} catch {
					/* no router here */
				}
			}
			return true;
		} catch (error) {
			this.status = 'error';
			this.lastError = error instanceof Error ? error.message : 'save failed';
			return false;
		}
	};

	#reconcilePendingRemote = () => {
		if (!this.#pendingRemote || this.#isDirty() || this.lastError === 'conflict') return;
		const { draft, revision } = this.#pendingRemote;
		this.#pendingRemote = null;
		if (revision > this.#rev) {
			this.#rev = revision;
			this.#lastHydrated = draft;
			this.#opts.applyRemote(draft);
		}
	};
}
