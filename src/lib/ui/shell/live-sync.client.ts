import { invalidate, invalidateAll } from '$app/navigation';
import { navigating } from '$app/state';
import { PAGE_REFRESH_COALESCE_MS } from './page-read-recovery';
import { isPageScopedSection, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { AI_ACTIVITY_EVENT, type AiActivity } from '$lib/shared/ai-activity';
import { LIVE_SESSION_EVENT, type LiveSessionSignal } from '$lib/shared/live-session';

/**
 * Real-time refresh: keep every open page in sync with the server without F5.
 *
 * One `clientId` per browser tab, sent on every save (`x-lyriks-client` header)
 * so the server's SSE stream can suppress the echo of our own write. `startLiveSync`
 * opens an EventSource for the project; each `change` event re-runs only the
 * `load`s that declared a dependency on the changed section (plus the
 * project-wide aggregate key for cross-section data like coherence) — the
 * page's stores then re-hydrate from the new `data`. A section-less event falls
 * back to `invalidateAll()`. EventSource reconnects on its own.
 *
 * Events are coalesced: an agent authoring through the MCP publishes one change
 * per call, dozens in a few seconds, and each used to re-run every load in the
 * tab (the coherence analysis included) while the previous run was still in
 * flight. Keys now collect for a short window and invalidate once, so a burst
 * costs one reload. And one reload at a time: while the loads of the last one
 * are still running (seconds on a large project under load), what arrives
 * waits and goes in one more reload after it, instead of starting a second set
 * of loads that SvelteKit aborts the first for. An AI writing every second used
 * to keep a page reloading without end, its server answering loads nobody read.
 *
 * An `activity` event (the person's AI read or wrote an Evolution request)
 * reloads nothing: it is re-emitted on `window` as `AI_ACTIVITY_EVENT`, for an
 * open dossier page to follow the AI while it works. A `live` event (what the
 * reader's own AI does in a live session) is re-emitted as `LIVE_SESSION_EVENT`.
 */

/** The window event a section change is re-emitted under, its detail the section that moved. */
export const SECTION_CHANGE_EVENT = 'lyriks:section-change';

/** Stable id for this tab — also stamped on save requests for echo suppression. */
export const clientId =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

/** How long a burst of change events is collected before one invalidation. */
const COALESCE_MS = PAGE_REFRESH_COALESCE_MS;

/** Open the live-sync stream for a project. Returns a teardown function. */
export function startLiveSync(projectId: string): () => void {
	if (typeof window === 'undefined' || !projectId) return () => {};
	const source = new EventSource(
		`/api/sync/events?projectId=${encodeURIComponent(projectId)}&clientId=${encodeURIComponent(clientId)}`
	);

	const pending = new Set<string>();
	let refreshAll = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** The reload in flight: what arrives meanwhile waits for it. */
	let reloading = false;
	let closed = false;

	const flush = () => {
		timer = null;
		if (closed) return;
		if (reloading) return; // the reload in flight schedules the next one when it ends
		// Invalidation replaces SvelteKit's navigation token. Let the person's
		// destination settle first, keeping every queued key until it does.
		if (navigating.to !== null) {
			schedule();
			return;
		}
		const keys = [...pending];
		const all = refreshAll;
		pending.clear();
		refreshAll = false;
		if (!all && keys.length === 0) return;
		reloading = true;
		// Synchronous calls batch into a single SvelteKit navigation.
		const done = all ? invalidateAll() : Promise.all(keys.map((key) => invalidate(key)));
		void Promise.resolve(done)
			.catch(() => {})
			.finally(() => {
				reloading = false;
				if (pending.size > 0 || refreshAll) schedule();
			});
	};
	const schedule = () => {
		if (timer === null && !reloading) timer = setTimeout(flush, COALESCE_MS);
	};

	source.addEventListener('change', (event) => {
		let section = '';
		try {
			const payload = JSON.parse((event as MessageEvent).data) as { section?: unknown };
			if (typeof payload.section === 'string') section = payload.section;
		} catch {
			// malformed payload → conservative full refresh below
		}
		if (!section) {
			refreshAll = true;
			schedule();
			return;
		}
		pending.add(sectionSyncKey(projectId, section));
		// A store that reads apart from the page loads (the AI session the floating chip reads) hears which section moved.
		window.dispatchEvent(new CustomEvent<string>(SECTION_CHANGE_EVENT, { detail: section }));
		// A dotted key is a slice of one public section (e.g. `foundation.identity`).
		// Loads only depend on the public section, so invalidate that too.
		const publicSection = section.split('.')[0];
		if (publicSection !== section) pending.add(sectionSyncKey(projectId, publicSection));
		// A badge refresh changes nothing authored: the Features page alone re-reads.
		if (!isPageScopedSection(section)) pending.add(projectSyncKey(projectId));
		schedule();
	});
	source.addEventListener('activity', (event) => {
		try {
			const detail = JSON.parse((event as MessageEvent).data) as AiActivity;
			window.dispatchEvent(new CustomEvent<AiActivity>(AI_ACTIVITY_EVENT, { detail }));
		} catch {
			// malformed payload: an activity is only a hint, drop it
		}
	});
	source.addEventListener('live', (event) => {
		try {
			const detail = JSON.parse((event as MessageEvent).data) as LiveSessionSignal;
			window.dispatchEvent(new CustomEvent<LiveSessionSignal>(LIVE_SESSION_EVENT, { detail }));
		} catch {
			// malformed payload: the next signal says the same, drop it
		}
	});
	// onerror: EventSource auto-reconnects; nothing to do but stay quiet.
	return () => {
		closed = true;
		if (timer !== null) clearTimeout(timer);
		source.close();
	};
}
