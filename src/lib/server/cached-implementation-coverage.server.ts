import type {
	FeatureImplementationCoverage,
	LoadImplementationCoverageUseCase
} from '$application/use-cases';
import { IMPLEMENTATION_COVERAGE_SECTION } from '$lib/shared/section-sync';
import { engineLane, type BackgroundLane } from './background-lane.server';
import type { SnapshotStore } from './residue-snapshot-store.server';
import { publishSectionChange, subscribeSectionChanges } from './sync-bus.server';

/**
 * Cached tier in front of the per-leaf implementation-coverage read. Mirrors
 * `CachedFeatureAdvisor`, and exists for the same reason: the underlying read is
 * one engine call PER LEAF over the shared stdio subprocess, serialized. On an
 * adopted project that is tens of seconds, and it used to run inside the
 * Features page `load`, which is exactly the 30s blank page it caused. Every
 * read now returns the last snapshot INSTANTLY; a stale entry recomputes in the
 * BACKGROUND, and a changed result publishes a synthetic section change so the
 * open Features tab re-runs its `load` and the chips fill in live.
 *
 * The refresh runs on the shared engine lane, ahead of the scoring and the
 * verification tiers: it is the cheapest of the three and the one a visible chip
 * waits on. The snapshot is also persisted, so a restarted process serves the
 * last known coverage on its first read instead of nothing.
 *
 * Lives at the server edge because it drives the live-sync bus; it depends only
 * on the application use-case, keeping the dependency arrow inward.
 */

const TTL_MS = 60_000;

/** Lane priority: before maturity advice (1) and behavior verification (2). */
const LANE_PRIORITY = 0;

/**
 * Sections whose edits change which leaves exist, and therefore which coverage
 * rows the snapshot should carry. The sidecar itself lives engine-side and is
 * invisible to the bus; its writes invalidate through `invalidate()` instead
 * (called by the implementation report/sync routes).
 */
const COVERAGE_INPUT_SECTIONS = new Set(['features']);

type Coverage = Record<string, FeatureImplementationCoverage>;

interface Entry {
	data: Coverage;
	at: number; // epoch ms of the last successful compute (0 = never)
	computing: boolean;
}

export interface CachedImplementationCoverageOptions {
	lane?: BackgroundLane;
	store?: SnapshotStore<Coverage>;
}

export class CachedImplementationCoverage {
	readonly #cache = new Map<string, Entry>();
	/** First reads of one project share the persisted-snapshot lookup. */
	readonly #seeding = new Map<string, Promise<Entry>>();
	readonly #lane: BackgroundLane;
	readonly #store: SnapshotStore<Coverage> | null;

	constructor(
		private readonly load: LoadImplementationCoverageUseCase,
		options: CachedImplementationCoverageOptions = {}
	) {
		this.#lane = options.lane ?? engineLane;
		this.#store = options.store ?? null;
		// Stale a project's snapshot when its leaf set changes, keeping the last
		// data so chips never flicker away. Our own `features-implementation` echo
		// is not an input section, so it can't loop.
		subscribeSectionChanges(({ projectId, section }) => {
			if (!COVERAGE_INPUT_SECTIONS.has(section)) return;
			const entry = this.#cache.get(projectId);
			if (entry && !entry.computing) entry.at = 0;
		});
	}

	async get(projectId: string): Promise<Coverage> {
		const entry = this.#cache.get(projectId) ?? (await this.#seed(projectId));
		if (!entry.computing && Date.now() - entry.at > TTL_MS) this.#refresh(projectId);
		return entry.data;
	}

	/**
	 * A sidecar write just landed (report/sync routes): stale the snapshot and
	 * recompute now, so the freshly reported coverage reaches open tabs without
	 * waiting out the TTL.
	 */
	invalidate(projectId: string): void {
		const entry = this.#cache.get(projectId);
		if (entry) entry.at = 0;
		this.#refresh(projectId);
	}

	/**
	 * The first read of a project: the persisted snapshot when there is one (a
	 * restart then shows the last known chips at once), empty otherwise. Either
	 * way the entry is born stale, so the caller's refresh brings it up to date.
	 */
	#seed(projectId: string): Promise<Entry> {
		const inFlight = this.#seeding.get(projectId);
		if (inFlight) return inFlight;
		const seeding = (this.#store?.load(projectId) ?? Promise.resolve(null))
			.catch(() => null)
			.then((stored): Entry => {
				const entry = this.#cache.get(projectId) ?? {
					data: stored ?? {},
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
		const entry = this.#cache.get(projectId) ?? { data: {}, at: 0, computing: false };
		if (entry.computing) return;
		entry.computing = true;
		this.#cache.set(projectId, entry);

		void this.#lane
			.run(`coverage:${projectId}`, LANE_PRIORITY, () => this.load.execute(projectId))
			.then((data) => {
				const changed = JSON.stringify(data) !== JSON.stringify(entry.data);
				this.#cache.set(projectId, { data, at: Date.now(), computing: false });
				if (changed) {
					void this.#store?.save(projectId, data).catch(() => {});
					// Loop-safe like the advisor: the reload served after this publish hits
					// a fresh entry (within TTL) and does not re-refresh.
					publishSectionChange({ projectId, section: IMPLEMENTATION_COVERAGE_SECTION, origin: null });
				}
			})
			.catch(() => {
				// Keep last-known data; back off a full TTL before retrying.
				this.#cache.set(projectId, { ...entry, at: Date.now(), computing: false });
			});
	}
}
