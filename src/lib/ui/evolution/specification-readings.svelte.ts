import type { LocalGraph } from '$domain/evolution';

/**
 * What one reading of the request's graph answers: the graph and where each
 * action of the Specification stands, by key, for the drafts `version` it was
 * read from. `unread` says the engine did not answer: the graph is then the last
 * good one of the same drafts, taken at `readAt`, or none (criterion c623df9c).
 */
export interface SpecificationReading<A> {
	readonly graph: LocalGraph | null;
	readonly actions: Readonly<Record<string, A>>;
	readonly readAt: string | null;
	readonly version: string;
	readonly unread?: string;
}

/** The engine did not answer the last reading: why, and when the actions shown were read (null when none is shown). */
export interface ActionsUnread {
	readonly reason: string;
	readonly readAt: string | null;
}

/**
 * The graph of a request and where each action of its Specification stands
 * (spec-actions.ts), read apart from the request because the engine computes
 * them on demand. Under load those readings land late and out of order, so the
 * page holds the reading begun last: one begun before a save never replaces one
 * begun after it, and an act on an action stays on the page until a reading
 * begun after its save is held (criterion b33f1a03). When the engine does not
 * answer, the page keeps the last good reading of the same drafts and says so;
 * it never shows a reading taken as if the drafts were not there (criterion c623df9c).
 */
export class SpecificationReadings<A> {
	graph = $state<LocalGraph | null>(null);
	actions = $state<Readonly<Record<string, A>>>({});
	unread = $state<ActionsUnread | null>(null);
	#version: string | null = null;
	#readAt: string | null = null;
	#begun = 0;
	#held = 0;
	#landed: { after: number; done: () => void }[] = [];

	constructor(private readonly read: () => Promise<SpecificationReading<A> | null>) {}

	/** Reads them again; true once the page holds this reading or one begun after it. */
	async load(): Promise<boolean> {
		const order = ++this.#begun;
		const answer = await this.read().catch(() => null);
		if (answer && order > this.#held) {
			this.#held = order;
			this.#hold(answer);
			for (const waiting of this.#landed.filter((w) => order > w.after)) waiting.done();
			this.#landed = this.#landed.filter((w) => order <= w.after);
		}
		return this.#held >= order;
	}

	/**
	 * After a save: reads them again, and resolves once a reading begun after the
	 * save is held. A reading that fails is followed by the next one the page
	 * takes, whatever starts it; the act stays as it was sent meanwhile.
	 */
	async readAgain(): Promise<void> {
		const after = this.#begun;
		const landed = new Promise<void>((done) => this.#landed.push({ after, done }));
		if (!(await this.load())) void this.load();
		await landed;
	}

	#hold(answer: SpecificationReading<A>): void {
		// The page's own last good reading stands in for the server's only for the same drafts.
		const keepOwn = answer.unread !== undefined && answer.graph === null && this.#version === answer.version && this.graph !== null;
		if (!keepOwn) {
			this.graph = answer.graph;
			this.actions = answer.actions;
			this.#readAt = answer.readAt;
		}
		this.#version = answer.version;
		this.unread = answer.unread === undefined ? null : { reason: answer.unread, readAt: this.graph === null ? null : this.#readAt };
	}
}
