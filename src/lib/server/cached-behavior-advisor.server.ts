import { needsRefresh, readSignature } from './engine-cache-staleness';
import type { BehaviorAdvisory, BehaviorAdvisoryPort } from '$application/ports';
import type { ComputeBehaviorAdvisoriesUseCase } from '$application/use-cases';
import type { SpecLanguage } from '$domain/language';
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


/**
 * Lane priority: last. Model-checking `verify` is the engine's most expensive
 * call, and nothing visible waits on it the way the badges wait on coverage (0)
 * and advice (1).
 */
const LANE_PRIORITY = 2;

/**
 * The persisted list with the language its cards are written in: a project
 * that declares another language must not be served the old one's cards after
 * a restart. A bare list comes from before the language was stored.
 */
export interface StoredAdvisories {
	readonly language: SpecLanguage;
	readonly data: BehaviorAdvisory[];
}

interface Entry {
	data: BehaviorAdvisory[];
	/** The language the cards are written in. */
	language: SpecLanguage;
	at: number; // epoch ms of the last successful compute (0 = never)
	/** The model signature the cards were computed against. */
	signature?: string | null;
	/** The refresh in flight, so a second caller joins it instead of starting one. */
	computing: Promise<void> | null;
	/** A batch landed while a pass was running: one more pass follows it. */
	again?: boolean;
	/** What the pass that chained this one left unchecked: the next chains only if it checks more. */
	chainedLeft?: number;
}

/** How many features a list of cards says the engine has not checked yet. */
export function uncheckedIn(data: readonly BehaviorAdvisory[]): number {
	return data.find((a) => a.code === 'capped')?.unchecked ?? 0;
}

export class CachedBehaviorAdvisor implements BehaviorAdvisoryPort {
	readonly #cache = new Map<string, Entry>();

	readonly #lane: BackgroundLane;
	/**
	 * The last computed list, kept in the project residue so a restarted process
	 * serves the coherence rings at once instead of empty until a whole
	 * background pass over every leaf has run. Born stale, so it refreshes.
	 */
	readonly #store: SnapshotStore<StoredAdvisories | BehaviorAdvisory[]> | null;
	readonly #seeding = new Map<string, Promise<Entry>>();
	readonly #signature: ((projectId: string) => string) | undefined;

	constructor(
		private readonly compute: ComputeBehaviorAdvisoriesUseCase,
		options: {
			lane?: BackgroundLane;
			store?: SnapshotStore<StoredAdvisories | BehaviorAdvisory[]>;
			/** The project's behaviour-model signature: the cards are recomputed when it moves (engine-cache-staleness). */
			signature?: (projectId: string) => string;
		} = {}
	) {
		this.#lane = options.lane ?? engineLane;
		this.#store = options.store ?? null;
		this.#signature = options.signature;
	}

	async get(projectId: string): Promise<BehaviorAdvisory[]> {
		const language = await this.#languageOf(projectId);
		const cached = this.#cache.get(projectId);
		// Cards written in another language than the one declared now are a miss.
		const entry =
			cached && cached.language === language ? cached : await this.#seed(projectId, language);
		if (!entry.computing && needsRefresh(entry, readSignature(this.#signature, projectId))) void this.#refresh(projectId);
		return entry.data;
	}

	/** The declared language, cheap to read (declaration only); English when it cannot be read. */
	async #languageOf(projectId: string): Promise<SpecLanguage> {
		try {
			return typeof this.compute.language === 'function'
				? await this.compute.language(projectId)
				: 'en';
		} catch {
			return 'en';
		}
	}

	/**
	 * The first read in a language: the persisted snapshot when it is written in
	 * it, stale so it refreshes behind. A snapshot in another language is a miss.
	 */
	#seed(projectId: string, language: SpecLanguage): Promise<Entry> {
		const key = `${projectId}\u0000${language}`;
		const inFlight = this.#seeding.get(key);
		if (inFlight) return inFlight;
		const seeding = (this.#store?.load(projectId) ?? Promise.resolve(null))
			.catch(() => null)
			.then((stored): Entry => {
				const cached = this.#cache.get(projectId);
				const entry =
					cached && cached.language === language
						? cached
						: {
								data: storedIn(stored, language),
								language,
								at: 0,
								// A refresh already running for the old language is left to finish.
								computing: null
							};
				this.#cache.set(projectId, entry);
				this.#seeding.delete(key);
				return entry;
			});
		this.#seeding.set(key, seeding);
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
		if (entry && !needsRefresh(entry, readSignature(this.#signature, projectId))) return;
		return this.#refresh(projectId);
	}

	/**
	 * A behaviour batch landed: the project is verified behind, without waiting
	 * for a reader (ac-leaf-ac-score-engine-reaches-all). Only a project someone
	 * read the advisories of in this process: nothing else consumes them.
	 */
	touch(projectId: string): void {
		const entry = this.#cache.get(projectId);
		if (!entry) return;
		entry.at = 0;
		if (entry.computing) entry.again = true;
		else void this.#refresh(projectId);
	}

	#refresh(projectId: string): Promise<void> {
		const entry = this.#cache.get(projectId) ?? {
			data: [],
			language: 'en' as SpecLanguage,
			at: 0,
			computing: null
		};
		if (entry.computing) return entry.computing;
		const signature = readSignature(this.#signature, projectId);

		const run = this.#lane
			.run(`advisories:${projectId}`, LANE_PRIORITY, async () => {
				const language = await this.#languageOf(projectId);
				return { language, data: await this.compute.execute(projectId) };
			})
			.then(({ language, data }) => {
				const changed =
					language !== entry.language || JSON.stringify(data) !== JSON.stringify(entry.data);
				// Features left unchecked chain the next pass at once rather than at the
				// next read a minute later, as long as each pass checks more of them: a
				// feature the engine can never stamp must not loop the lane forever.
				const left = uncheckedIn(data);
				const progressed = entry.chainedLeft === undefined || left < entry.chainedLeft;
				const again = entry.again === true || (left > 0 && progressed);
				this.#cache.set(projectId, {
					data,
					language,
					at: Date.now(),
					computing: null,
					signature,
					...(again ? { chainedLeft: left } : {})
				});
				// Push over live-sync so both surfaces update without a click. Safe from
				// loops: the reload reads a now-fresh cache and does not re-refresh.
				if (changed) {
					void this.#store?.save(projectId, { language, data }).catch(() => {});
					publishSectionChange({ projectId, section: 'coherence', origin: null });
				}
				if (again) void this.#refresh(projectId);
			})
			.catch(() => {
				// Keep last-known data; retry once the model moves or past the safety age (engine-cache-staleness).
				this.#cache.set(projectId, { ...entry, at: Date.now(), computing: null, signature });
			});

		entry.computing = run;
		this.#cache.set(projectId, entry);
		return run;
	}
}

/**
 * The persisted cards when they are written in `language`. A bare list, stored
 * before the language was, is taken as English: every card was English then.
 */
function storedIn(stored: unknown, language: SpecLanguage): BehaviorAdvisory[] {
	if (Array.isArray(stored)) return language === 'en' ? (stored as BehaviorAdvisory[]) : [];
	const s = stored as Partial<StoredAdvisories> | null;
	return s && s.language === language && Array.isArray(s.data) ? s.data : [];
}
