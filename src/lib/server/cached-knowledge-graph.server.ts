import type { KnowledgeGraph } from '$domain/graph';
import type { KnowledgeGraphProviderPort, ProjectModelRevisionPort } from '$application/ports';
import { subscribeSectionChanges } from './sync-bus.server';

/**
 * How long an assembled picture may be reused while its key has not moved. The
 * key covers the spec (section revisions + the kernel folder); this bound
 * covers the inputs it cannot see: the formal verdict the Enterprise back
 * recomputes on its own clock, and the upstream capability rows.
 */
const FRESH_MS = 5 * 60_000;

/** Projects held at once. Beyond this the least recently read entries are dropped. */
const MAX_ENTRIES = 200;

interface Entry {
	key: string;
	graph: KnowledgeGraph;
	at: number;
}

export interface CachedKnowledgeGraphOptions {
	/** Names the tier in the rebuild log line (`local`, `merged`). */
	label?: string;
	now?: () => number;
	/**
	 * Where project changes that bypass the key arrive: the sync bus by default
	 * (a synthetic `coherence` change when a behavior advisory lands, for one).
	 * Returns the unsubscribe.
	 */
	subscribe?: (listener: (change: { projectId: string }) => void) => () => void;
	freshMs?: number;
}

/**
 * The knowledge graph, assembled once per spec revision and served as it
 * stands until the spec moves.
 *
 * Every reader of the graph (the explorer, the search, the `get_knowledge_graph`
 * tool, and from here on the cross-section checks) used to pay the whole
 * projection on each read: seven section loads, the coherence analysis with its
 * per-leaf kernel reads, the capability rows, then the behavior overlay. None
 * of that can differ while the sections and the kernel folder are what they
 * were, so the picture is keyed on exactly that: the section revisions (the
 * `ProjectModelRevisionPort` fingerprint) and the kernel folder signature
 * (behavior authored through the engine leaves no section revision behind).
 * Any real edit moves the key and the next read assembles again; nothing is
 * ever served from an older spec, which is the invariant the feature declares.
 *
 * Same shape as the other cached tiers: one in-flight build per key so
 * concurrent readers share it, LRU over projects, a freshness bound as a safety
 * net for inputs the key cannot see. Lives at the server edge because it
 * listens to the sync bus; the providers underneath stay pure.
 */
export class CachedKnowledgeGraph implements KnowledgeGraphProviderPort {
	readonly #entries = new Map<string, Entry>();
	/** One assembly per key: readers arriving mid-build wait on it instead of racing. */
	readonly #inFlight = new Map<string, Promise<KnowledgeGraph>>();
	readonly #label: string;
	readonly #now: () => number;
	readonly #freshMs: number;

	constructor(
		private readonly inner: KnowledgeGraphProviderPort,
		private readonly modelRevision: ProjectModelRevisionPort,
		/** Identity of the project's kernel folder; see `LocalFsBehaviorRepository.kernelSignature`. */
		private readonly kernelSignature: (projectId: string) => string,
		options: CachedKnowledgeGraphOptions = {}
	) {
		this.#label = options.label ?? 'graph';
		this.#now = options.now ?? Date.now;
		this.#freshMs = options.freshMs ?? FRESH_MS;
		(options.subscribe ?? subscribeSectionChanges)((change) => this.invalidate(change.projectId));
	}

	async build(projectId: string): Promise<KnowledgeGraph> {
		const key = await this.#key(projectId);
		const cached = this.#entries.get(projectId);
		if (cached && cached.key === key && this.#now() - cached.at <= this.#freshMs) {
			// Refresh recency so an active project is not the one we evict.
			this.#entries.delete(projectId);
			this.#entries.set(projectId, cached);
			return cached.graph;
		}

		const pending = this.#inFlight.get(key);
		if (pending) return pending;

		const startedAt = this.#now();
		const run = this.inner
			.build(projectId)
			.then((graph) => {
				this.#remember(projectId, key, graph);
				// One line per real assembly; served pictures stay silent.
				console.log(
					`[graph] ${projectId}: ${this.#label} picture assembled in ${this.#now() - startedAt}ms (${graph.nodes.length} nodes, ${graph.edges.length} edges)`
				);
				return graph;
			})
			.finally(() => {
				this.#inFlight.delete(key);
			});
		this.#inFlight.set(key, run);
		return run;
	}

	/** Drop a project's picture, e.g. after a change that left no revision behind. */
	invalidate(projectId: string): void {
		this.#entries.delete(projectId);
	}

	async #key(projectId: string): Promise<string> {
		const model = await this.modelRevision.fingerprint(projectId);
		return `${projectId}|${model}|${this.kernelSignature(projectId)}`;
	}

	#remember(projectId: string, key: string, graph: KnowledgeGraph): void {
		this.#entries.delete(projectId);
		this.#entries.set(projectId, { key, graph, at: this.#now() });
		while (this.#entries.size > MAX_ENTRIES) {
			const oldest = this.#entries.keys().next();
			if (oldest.done) break;
			this.#entries.delete(oldest.value);
		}
	}
}
