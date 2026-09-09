import { invalidate, invalidateAll } from '$app/navigation';
import { isPageScopedSection, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';

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
 * costs one reload.
 */

/** Stable id for this tab — also stamped on save requests for echo suppression. */
export const clientId =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

/** How long a burst of change events is collected before one invalidation. */
const COALESCE_MS = 250;

/** Open the live-sync stream for a project. Returns a teardown function. */
export function startLiveSync(projectId: string): () => void {
	if (typeof window === 'undefined' || !projectId) return () => {};
	const source = new EventSource(
		`/api/sync/events?projectId=${encodeURIComponent(projectId)}&clientId=${encodeURIComponent(clientId)}`
	);

	const pending = new Set<string>();
	let refreshAll = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const flush = () => {
		timer = null;
		const keys = [...pending];
		const all = refreshAll;
		pending.clear();
		refreshAll = false;
		if (all) {
			void invalidateAll();
			return;
		}
		// Synchronous calls batch into a single SvelteKit navigation.
		for (const key of keys) void invalidate(key);
	};
	const schedule = () => {
		if (timer === null) timer = setTimeout(flush, COALESCE_MS);
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
		// A dotted key is a slice of one public section (e.g. `foundation.identity`).
		// Loads only depend on the public section, so invalidate that too.
		const publicSection = section.split('.')[0];
		if (publicSection !== section) pending.add(sectionSyncKey(projectId, publicSection));
		// A badge refresh changes nothing authored: the Features page alone re-reads.
		if (!isPageScopedSection(section)) pending.add(projectSyncKey(projectId));
		schedule();
	});
	// onerror: EventSource auto-reconnects; nothing to do but stay quiet.
	return () => {
		if (timer !== null) clearTimeout(timer);
		source.close();
	};
}
