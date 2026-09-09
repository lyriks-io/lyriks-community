import type { FeatureAdvice, ScoreFeaturesUseCase } from '$application/use-cases';
import { FEATURE_ADVICE_SECTION } from '$lib/shared/section-sync';
import { engineLane, type BackgroundLane } from './background-lane.server';
import type { SnapshotStore } from './residue-snapshot-store.server';
import { publishSectionChange, subscribeSectionChanges } from './sync-bus.server';

/**
 * Cached tier in front of the (heavy) per-leaf Unspaghettit scoring. Mirrors
 * `CachedBehaviorAdvisor`: every read returns the last snapshot INSTANTLY, so the
 * Features page never blocks the maturity badges on the engine; a stale entry
 * refreshes the real scoring in the BACKGROUND. When a refresh changes the
 * result, it publishes a section change so the open Features tab `invalidate`s and
 * the badges fill in live — no manual "Retry".
 *
 * The refresh runs on the shared engine lane, after the implementation coverage
 * (a cheaper read behind a visible chip) and before the behavior verification.
 * The snapshot is persisted so a restarted process serves the last known advice
 * on its first read.
 *
 * Lives at the server edge because it drives the live-sync bus; it depends only on
 * the application use-case, keeping the dependency arrow inward.
 */

const TTL_MS = 60_000;

/** Lane priority: after implementation coverage (0), before verification (2). */
const LANE_PRIORITY = 1;

/**
 * Sections whose edits change what a maturity score should be. A change here
 * invalidates the project's snapshot so the next read recomputes promptly (e.g.
 * a leaf added/removed, or behavior authored) — not just on the TTL tick.
 */
const SCORE_INPUT_SECTIONS = new Set(['features', 'rules']);

interface Entry {
	data: FeatureAdvice[];
	at: number; // epoch ms of the last successful compute (0 = never)
	computing: boolean;
}

export interface CachedFeatureAdvisorOptions {
	lane?: BackgroundLane;
	store?: SnapshotStore<FeatureAdvice[]>;
}

export class CachedFeatureAdvisor {
	readonly #cache = new Map<string, Entry>();
	/** First reads of one project share the persisted-snapshot lookup. */
	readonly #seeding = new Map<string, Promise<Entry>>();
	readonly #lane: BackgroundLane;
	readonly #store: SnapshotStore<FeatureAdvice[]> | null;

	constructor(
		private readonly score: ScoreFeaturesUseCase,
		options: CachedFeatureAdvisorOptions = {}
	) {
		this.#lane = options.lane ?? engineLane;
		this.#store = options.store ?? null;
		// Mark a project's snapshot stale when its scored inputs change, so the next
		// read refreshes instead of serving a stale score for a whole TTL. Keep the
		// last data (no badge flicker) and only stale live entries — a cold entry
		// already refreshes on its own. Our own `features-advice` echo is not a
		// scored input, so it can't loop.
		subscribeSectionChanges(({ projectId, section }) => {
			if (!SCORE_INPUT_SECTIONS.has(section)) return;
			const entry = this.#cache.get(projectId);
			if (entry && !entry.computing) entry.at = 0;
		});
	}

	async get(projectId: string): Promise<FeatureAdvice[]> {
		const entry = this.#cache.get(projectId) ?? (await this.#seed(projectId));
		if (!entry.computing && Date.now() - entry.at > TTL_MS) this.#refresh(projectId);
		return entry.data;
	}

	/** The first read: the persisted snapshot if any, born stale so it refreshes. */
	#seed(projectId: string): Promise<Entry> {
		const inFlight = this.#seeding.get(projectId);
		if (inFlight) return inFlight;
		const seeding = (this.#store?.load(projectId) ?? Promise.resolve(null))
			.catch(() => null)
			.then((stored): Entry => {
				const entry = this.#cache.get(projectId) ?? {
					data: Array.isArray(stored) ? stored : [],
					at: 0,
					computing: false
				};
				this.#cache.set(projectId, entry);
				this.#seeding.delete(projectId);
				return entry;
			});
		this.#seeding.set(projectId, seeding);
		return seeding;
	}

	#refresh(projectId: string): void {
		const entry = this.#cache.get(projectId) ?? { data: [], at: 0, computing: false };
		if (entry.computing) return;
		entry.computing = true;
		this.#cache.set(projectId, entry);

		void this.#lane
			.run(`advice:${projectId}`, LANE_PRIORITY, () => this.score.execute(projectId))
			.then((data) => {
				const changed = JSON.stringify(data) !== JSON.stringify(entry.data);
				this.#cache.set(projectId, { data, at: Date.now(), computing: false });
				if (changed) {
					void this.#store?.save(projectId, data).catch(() => {});
					// Push over live-sync so the Features tab re-reads the now-fresh cache.
					// Loop-safe: the reload hits a fresh entry (within TTL) and does not
					// re-refresh.
					publishSectionChange({ projectId, section: FEATURE_ADVICE_SECTION, origin: null });
				}
			})
			.catch(() => {
				// Keep last-known data; back off a full TTL before retrying.
				this.#cache.set(projectId, { ...entry, at: Date.now(), computing: false });
			});
	}
}
