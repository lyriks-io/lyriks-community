/**
 * One lane for the background work the cached tiers hand to the behavior engine.
 *
 * The engine is a single-threaded stdio subprocess. The three tiers that refresh
 * behind a page load (implementation coverage, maturity advice, behavior
 * advisories) each used to fan out one call per leaf at once, so a Features page
 * on a 40-leaf project queued a hundred-odd calls on it in one go. The cheap
 * coverage reads then waited behind model-checking `verify` calls, and when one
 * of those exceeded its budget the subprocess was recycled and every pending
 * call died with it: the implementation chip stayed empty for a whole TTL, on a
 * loop.
 *
 * Here the tiers run one after another, lowest priority number first, so the
 * reads that feed a visible badge land before the expensive verification, and a
 * budget kill takes down one task rather than all of them. A task queued twice
 * under the same key before it starts runs once.
 */

interface Task {
	readonly key: string;
	readonly priority: number;
	readonly run: () => Promise<unknown>;
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: unknown) => void;
	readonly promise: Promise<unknown>;
	/** Queue arrival, so equal priorities stay first come first served. */
	readonly seq: number;
}

export class BackgroundLane {
	readonly #queue: Task[] = [];
	#running = false;
	#seq = 0;

	/** Queue `run` under `key`; resolves with its result once its turn came. */
	run<T>(key: string, priority: number, run: () => Promise<T>): Promise<T> {
		const queued = this.#queue.find((task) => task.key === key);
		if (queued) return queued.promise as Promise<T>;
		let resolve!: (value: unknown) => void;
		let reject!: (reason: unknown) => void;
		const promise = new Promise<unknown>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.#queue.push({ key, priority, run, resolve, reject, promise, seq: this.#seq++ });
		this.#queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
		void this.#drain();
		return promise as Promise<T>;
	}

	/** Tasks waiting for their turn (the running one excluded). */
	get pending(): number {
		return this.#queue.length;
	}

	async #drain(): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		try {
			for (let task = this.#queue.shift(); task; task = this.#queue.shift()) {
				try {
					task.resolve(await task.run());
				} catch (error) {
					task.reject(error);
				}
			}
		} finally {
			this.#running = false;
		}
	}
}

/** The process-wide lane every cached tier shares: one engine, one queue. */
export const engineLane = new BackgroundLane();
