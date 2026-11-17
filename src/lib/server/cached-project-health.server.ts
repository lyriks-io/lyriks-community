import type { ProjectModelRevisionPort } from '$application/ports';
import type { ProjectHealth } from '$domain/coherence';
import { PROJECT_HEALTH_SECTION } from '$lib/shared/section-sync';
import type { SnapshotStore } from './residue-snapshot-store.server';
import { publishSectionChange, subscribeSectionChanges } from './sync-bus.server';

/**
 * Project health as the pages show it (ac-score-shown-at-once): never waited
 * for.
 *
 * A reading of Project health runs the completeness audit, whose evidence
 * includes the end-to-end verification of the Experience by the engine: some
 * twenty seconds on a large project, thirty on one of 280 features. Here a page
 * gets the last reading at once, kept in the project residue so a restart does
 * not cost it either, and a project never read before opens at once too, while
 * its first reading is taken behind. A new reading is taken, one at a time,
 * when the model changed, when a write landed in the project (the code read
 * against the spec included, which the model's fingerprint does not follow), or
 * once `HEALTH_FRESH_MS` has passed; when it lands and differs, a change goes
 * out over live-sync so the open pages read it in place.
 *
 * The API and the agents read the use case itself, fresh: this tier is for
 * what a person looks at.
 */

/** Provisional constant healthFreshFor: how long a reading is served before a new one is taken behind. */
export const HEALTH_FRESH_MS = 10 * 60_000;

/**
 * Provisional constants proofRecheckSeconds and proofRecheckLimit (criterion
 * 5785c1fb): a reading taken while the formal proof of the specification still
 * ran is taken again this long after, this many times in a row at most, so the
 * figure lands in place once the proof does and a proof that never lands does
 * not keep the engine busy.
 */
export const PROOF_RECHECK_MS = 10_000;
export const PROOF_RECHECK_LIMIT = 12;

interface HealthReader {
	execute(projectId: string): Promise<ProjectHealth>;
}

/** The persisted reading, with the model it was taken on. */
export interface StoredHealth {
	readonly model: string;
	readonly health: ProjectHealth;
}

interface Entry {
	health: ProjectHealth | null;
	/** The model fingerprint the reading was taken on. */
	model: string;
	/** Epoch ms of the reading; -Infinity for one kept across a restart, which refreshes behind. */
	at: number;
	/** A write landed in the project since the reading began. */
	dirty: boolean;
	computing: Promise<ProjectHealth | null> | null;
	/** Readings taken in a row while the formal proof still ran. */
	proofRechecks: number;
}

export class CachedProjectHealth {
	readonly #cache = new Map<string, Entry>();
	readonly #seeding = new Map<string, Promise<Entry>>();
	readonly #store: SnapshotStore<StoredHealth> | null;
	readonly #now: () => number;
	readonly #later: (run: () => void, ms: number) => void;

	constructor(
		private readonly read: HealthReader,
		private readonly model: ProjectModelRevisionPort,
		options: {
			store?: SnapshotStore<StoredHealth>;
			now?: () => number;
			subscribe?: typeof subscribeSectionChanges;
			/** Runs a recheck later; a timer that never holds the process open by default. */
			later?: (run: () => void, ms: number) => void;
		} = {}
	) {
		this.#store = options.store ?? null;
		this.#now = options.now ?? Date.now;
		this.#later = options.later ?? ((run, ms) => void setTimeout(run, ms).unref?.());
		// Any write to the project calls for a new reading, ours excepted, so it cannot loop.
		(options.subscribe ?? subscribeSectionChanges)(({ projectId, section }) => {
			if (section === PROJECT_HEALTH_SECTION) return;
			const entry = this.#cache.get(projectId);
			if (entry) entry.dirty = true;
		});
	}

	/** The last reading at once, a new one taken behind when it is stale; null while a project's first reading is taken. */
	async get(projectId: string): Promise<ProjectHealth | null> {
		const entry = await this.#seed(projectId);
		if (entry.computing) return entry.health;
		const model = await this.model.fingerprint(projectId).catch(() => entry.model);
		// Never read (or kept across a restart), written to, another model, or old: read again. A reading that
		// failed waits a full freshness, so an engine that is down is not asked at every page.
		const stale = entry.at === Number.NEGATIVE_INFINITY || entry.dirty || model !== entry.model || this.#now() - entry.at > HEALTH_FRESH_MS;
		if (stale) void this.#refresh(projectId, entry, model);
		return entry.health;
	}

	/** The project's first reading is being taken: the pages say so instead of reading as if nothing waited. */
	reading(projectId: string): boolean {
		const entry = this.#cache.get(projectId);
		return !!entry && entry.health === null && entry.computing !== null;
	}

	/** The first read since the process started: the persisted reading, stale so it refreshes behind. */
	#seed(projectId: string): Promise<Entry> {
		const cached = this.#cache.get(projectId);
		if (cached) return Promise.resolve(cached);
		const inFlight = this.#seeding.get(projectId);
		if (inFlight) return inFlight;
		const seeding = (this.#store?.load(projectId) ?? Promise.resolve(null))
			.catch(() => null)
			.then((stored): Entry => {
				const entry = this.#cache.get(projectId) ?? {
					health: stored?.health ?? null,
					model: stored?.model ?? '',
					at: Number.NEGATIVE_INFINITY,
					dirty: false,
					computing: null,
					proofRechecks: 0
				};
				this.#cache.set(projectId, entry);
				this.#seeding.delete(projectId);
				return entry;
			});
		this.#seeding.set(projectId, seeding);
		return seeding;
	}

	#refresh(projectId: string, entry: Entry, model: string): Promise<ProjectHealth | null> {
		if (entry.computing) return entry.computing;
		entry.dirty = false;
		const run = this.read
			.execute(projectId)
			.then((health) => {
				const changed = entry.health === null || JSON.stringify(health) !== JSON.stringify(entry.health);
				// Another model is another proof: its rechecks start over.
				if (model !== entry.model) entry.proofRechecks = 0;
				Object.assign(entry, { health, model, at: this.#now(), computing: null });
				if (changed) {
					void this.#store?.save(projectId, { model, health }).catch(() => {});
					// The open pages read it in place; safe from loops: the reload finds it fresh.
					publishSectionChange({ projectId, section: PROJECT_HEALTH_SECTION, origin: null });
				}
				this.#recheckWhileProving(projectId, entry, health);
				return health;
			})
			.catch(() => {
				// Keep the last reading; wait a full freshness, or another model, before trying again.
				Object.assign(entry, { model, at: this.#now(), computing: null });
				return entry.health;
			});
		entry.computing = run;
		return run;
	}

	/** Read again shortly while the formal proof runs, so its verdict lands in place (criterion 5785c1fb). */
	#recheckWhileProving(projectId: string, entry: Entry, health: ProjectHealth): void {
		if (health.proofPending !== true) {
			entry.proofRechecks = 0;
			return;
		}
		if (entry.proofRechecks >= PROOF_RECHECK_LIMIT) return;
		entry.proofRechecks += 1;
		this.#later(() => {
			entry.dirty = true;
			void this.get(projectId);
		}, PROOF_RECHECK_MS);
	}
}
