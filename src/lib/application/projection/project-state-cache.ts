import type { ProjectModelRevisionPort } from '../ports';

/** Projects held at once by default. Beyond this the least recently read entries are dropped. */
const MAX_PROJECTS = 200;

interface Entry<V> {
	readonly key: string;
	readonly value: V;
}

export interface ProjectStateReadOptions<V> {
	/** Compute whatever the state says, and keep the result. */
	readonly force?: boolean;
	/** Whether this result may be served again. A reading built on a failed read should not be. */
	readonly keep?: (value: V) => boolean;
}

/**
 * One reading per project, kept while the state of its spec has not moved.
 *
 * A read that folds the whole model runs on every page and costs the same each
 * time, on a server with one thread to give. Nothing it reads can differ while
 * the section revisions and the behaviour folder are what they were, so the
 * reading is keyed on exactly those: any real edit moves the key and the next
 * read computes again. Readers arriving during a computation wait on it.
 *
 * Callers share the value: it is never to be changed in place.
 */
export class ProjectStateCache<V> {
	readonly #entries = new Map<string, Entry<V>>();
	readonly #inFlight = new Map<string, Promise<V>>();

	constructor(
		private readonly revision: ProjectModelRevisionPort,
		private readonly kernelSignature: (projectId: string) => string,
		/** Lower it for a reading that weighs megabytes on a large project. */
		private readonly maxProjects: number = MAX_PROJECTS
	) {}

	async read(projectId: string, compute: () => Promise<V>, options: ProjectStateReadOptions<V> = {}): Promise<V> {
		const key = `${await this.revision.fingerprint(projectId)}|${this.kernelSignature(projectId)}`;
		if (!options.force) {
			const held = this.#entries.get(projectId);
			if (held?.key === key) {
				this.#remember(projectId, held);
				return held.value;
			}
		}
		const flight = `${projectId}|${key}|${options.force ? 'forced' : 'read'}`;
		const pending = this.#inFlight.get(flight);
		if (pending) return pending;
		const before = this.#entries.get(projectId);
		const computing = compute()
			.then((value) => {
				const current = this.#entries.get(projectId);
				// A slower calculation of an older revision must not evict the newer
				// reading that finished while it was running.
				if ((options.keep?.(value) ?? true) && (current === before || current?.key === key))
					this.#remember(projectId, { key, value });
				return value;
			})
			.finally(() => this.#inFlight.delete(flight));
		this.#inFlight.set(flight, computing);
		return computing;
	}

	/** The most recently read project goes last, so the oldest is the first dropped. */
	#remember(projectId: string, entry: Entry<V>): void {
		this.#entries.delete(projectId);
		this.#entries.set(projectId, entry);
		if (this.#entries.size > this.maxProjects) {
			const oldest = this.#entries.keys().next().value;
			if (oldest !== undefined) this.#entries.delete(oldest);
		}
	}
}
