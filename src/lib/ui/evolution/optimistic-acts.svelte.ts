import { trackSave } from '$ui/shell/pending-saves.svelte';

/**
 * Acts sent from a page and not read back yet (ac-evo-form-edit-optimistic),
 * by a key the page chooses. An act reads on the page the moment it is sent;
 * after a save it stays until the page has read the request again (the
 * reading the page watches changes), so it never blinks back to how it stood;
 * a failed save drops it at once, which puts the page back.
 *
 * A second act on a key whose first act is still saving replaces it on the
 * page at once, and its save waits for the first one: the first one answering
 * never takes the second off the page. When the first save fails, the acts
 * queued behind it on its keys were built on an outcome that did not happen:
 * they are dropped too, unsaved.
 *
 * Saving ends at the server's answer (criterion 27bbfacd): accepted, the act
 * stays as it was sent until it is read back, then leaves; refused, it leaves at
 * once. A later act on the same key waits for that answer, not for the read-back.
 */
// Provisional: the longest a page took to read the request again after a save, to be measured on real runs.
const READ_BACK_MS = 5000;

/**
 * How an act learns its outcome was read back once the server accepted it: the
 * reading the page watches, which changes once read again (at most READ_BACK_MS),
 * or a read-back the page runs after the answer and the act waits for, with no
 * delay of its own (a reading begun after the save, never an earlier one).
 */
export type ReadBack = (() => unknown) | { readonly readAgain: () => Promise<void> };

/** Resolves once `reading` no longer returns `before`, or after `ms`. */
function readBack(reading: () => unknown, before: unknown, ms: number): Promise<void> {
	const until = Date.now() + ms;
	return new Promise((done) => {
		const look = () => (reading() !== before || Date.now() >= until ? done() : requestAnimationFrame(look));
		requestAnimationFrame(look);
	});
}

export class OptimisticActs<T> {
	#acts = $state<Record<string, T>>({});
	/** Which send holds each key on the page now, so an earlier one settling leaves a later one alone. */
	#holders = new Map<string, number>();
	/** The latest save still running on each key: what a later act on that key waits for. */
	#saving = new Map<string, Promise<boolean>>();
	#sent = 0;

	/** The act sent on this key and not read back yet. */
	of(key: string): T | null {
		return this.#acts[key] ?? null;
	}

	/** Every act sent and not read back yet, by its key. */
	get all(): Readonly<Record<string, T>> {
		return this.#acts;
	}

	/** Sends one act: it reads at once, stays until `reading` changes after a save, and leaves at once on a failure. */
	run(key: string, act: T, save: () => Promise<boolean>, reading: ReadBack): Promise<boolean> {
		return this.runEach({ [key]: act }, save, reading);
	}

	/** Sends one act on several keys in a single save ("Validate all" of a section): each reads it as `run` does for one. */
	runAll(keys: readonly string[], act: T, save: () => Promise<boolean>, reading: ReadBack): Promise<boolean> {
		return this.runEach(Object.fromEntries(keys.map((key) => [key, act])), save, reading);
	}

	/** Sends one save that changes several keys, each read with its own act (a section saved with several answers). */
	async runEach(acts: Readonly<Record<string, T>>, save: () => Promise<boolean>, reading: ReadBack): Promise<boolean> {
		const keys = Object.keys(acts);
		const sent = ++this.#sent;
		const earlier = [...new Set(keys.map((key) => this.#saving.get(key)).filter((p): p is Promise<boolean> => !!p))];
		this.#acts = { ...this.#acts, ...acts };
		for (const key of keys) this.#holders.set(key, sent);
		let before: unknown;
		const answered = (async () => {
			// An act built on one still saving goes after it, and never alone once that one failed;
			// with nothing before it, it is sent right away.
			if (earlier.length > 0 && (await Promise.all(earlier)).some((ok) => !ok)) return false;
			if (typeof reading === 'function') before = reading();
			try {
				return await save();
			} catch {
				return false;
			}
		})();
		for (const key of keys) this.#saving.set(key, answered);
		// The window says Saving until the server confirmed or refused this act (criterion 27bbfacd).
		void trackSave(answered).catch(() => undefined);
		const settled = answered.then(async (saved) => {
			if (saved) await (typeof reading === 'function' ? readBack(reading, before, READ_BACK_MS) : reading.readAgain().catch(() => undefined));
			return saved;
		});
		try {
			return await settled;
		} finally {
			for (const key of keys) if (this.#saving.get(key) === answered) this.#saving.delete(key);
			const held = keys.filter((key) => this.#holders.get(key) === sent);
			for (const key of held) this.#holders.delete(key);
			if (held.length > 0) this.#acts = Object.fromEntries(Object.entries(this.#acts).filter(([key]) => !held.includes(key)));
		}
	}
}
