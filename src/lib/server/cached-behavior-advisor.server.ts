import type { BehaviorAdvisory, BehaviorAdvisoryPort } from '$application/ports';
import type { ComputeBehaviorAdvisoriesUseCase } from '$application/use-cases';
import { engineLane, type BackgroundLane } from './background-lane.server';
import type { SnapshotStore } from './residue-snapshot-store.server';
import { publishSectionChange } from './sync-bus.server';

/**
 * The production `BehaviorAdvisoryPort`: serves a cached snapshot instantly on
 * every read (so page loads and the Control Center never block on the unspa
 * engine), and refreshes the real verification in the BACKGROUND when the cache
 * is stale. When a refresh changes the result, it publishes a `coherence`
 * section change so connected tabs `invalidateAll` and re-render — the advisories
 * appear/update in real time, with no "Run check" click.
 *
 * Lives at the server edge because it drives the live-sync bus; it depends only
 * on the application use-case + the port, keeping the dependency arrow inward.
 */

const TTL_MS = 60_000;

/**
 * Lane priority: last. Model-checking `verify` is the engine's most expensive
 * call, and nothing visible waits on it the way the badges wait on coverage (0)
 * and advice (1).
 */
const LANE_PRIORITY = 2;

interface Entry {
	data: BehaviorAdvisory[];
	at: number; // epoch ms of the last successful compute (0 = never)
	/** The refresh in flight, so a second caller joins it instead of starting one. */
	computing: Promise<void> | null;
}

export class CachedBehaviorAdvisor implements BehaviorAdvisoryPort {
	readonly #cache = new Map<string, Entry>();

	readonly #lane: BackgroundLane;
	/**
	 * The last computed list, kept in the project residue so a restarted process
	 * serves the coherence rings at once instead of empty until a whole
	 * background pass over every leaf has run. Born stale, so it refreshes.
	 */
	readonly #store: SnapshotStore<BehaviorAdvisory[]> | null;
	readonly #seeding = new Map<string, Promise<Entry>>();

	constructor(
		private readonly compute: ComputeBehaviorAdvisoriesUseCase,
		options: { lane?: BackgroundLane; store?: SnapshotStore<BehaviorAdvisory[]> } = {}
	) {
		this.#lane = options.lane ?? engineLane;
		this.#store = options.store ?? null;
	}

	async get(projectId: string): Promise<BehaviorAdvisory[]> {
		const entry = this.#cache.get(projectId) ?? (await this.#seed(projectId));
		if (!entry.computing && Date.now() - entry.at > TTL_MS) void this.#refresh(projectId);
		return entry.data;
	}

	/** The first read: the persisted snapshot if any, stale so it refreshes behind. */
	#seed(projectId: string): Promise<Entry> {
		const inFlight = this.#seeding.get(projectId);
		if (inFlight) return inFlight;
		const seeding = (this.#store?.load(projectId) ?? Promise.resolve(null))
			.catch(() => null)
			.then((stored): Entry => {
				const entry = this.#cache.get(projectId) ?? {
					data: Array.isArray(stored) ? stored : [],
					at: 0,
					computing: null
				};
				this.#cache.set(projectId, entry);
				this.#seeding.delete(projectId);
				return entry;
			});
		this.#seeding.set(projectId, seeding);
		return seeding;
	}

	/**
	 * Compute now and WAIT, instead of serving `[]` and refreshing behind the
	 * reader's back.
	 *
	 * For a project nobody has read yet the two are not equivalent: readers that
	 * average dimensions (coverage, readiness) would score it without the
	 * behavior dimension and report a figure no other project reports, purely
	 * because this cache had not run yet. A project that is created as a copy of
	 * another must not read differently from its original on its first render,
	 * so its creator primes it before anyone looks.
	 */
	async prime(projectId: string): Promise<void> {
		const entry = this.#cache.get(projectId);
		if (entry?.computing) return entry.computing;
		if (entry && entry.at > 0 && Date.now() - entry.at <= TTL_MS) return;
		return this.#refresh(projectId);
	}

	#refresh(projectId: string): Promise<void> {
		const entry = this.#cache.get(projectId) ?? { data: [], at: 0, computing: null };
		if (entry.computing) return entry.computing;

		const run = this.#lane
			.run(`advisories:${projectId}`, LANE_PRIORITY, () => this.compute.execute(projectId))
			.then((data) => {
				const changed = JSON.stringify(data) !== JSON.stringify(entry.data);
				this.#cache.set(projectId, { data, at: Date.now(), computing: null });
				// Push over live-sync so both surfaces update without a click. Safe from
				// loops: the reload reads a now-fresh cache and does not re-refresh.
				if (changed) {
					void this.#store?.save(projectId, data).catch(() => {});
					publishSectionChange({ projectId, section: 'coherence', origin: null });
				}
			})
			.catch(() => {
				// Keep last-known data; back off a full TTL before retrying.
				this.#cache.set(projectId, { ...entry, at: Date.now(), computing: null });
			});

		entry.computing = run;
		this.#cache.set(projectId, entry);
		return run;
	}
}
