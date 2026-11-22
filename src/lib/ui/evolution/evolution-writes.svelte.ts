import { getContext, setContext } from 'svelte';
import { invalidateAll } from '$app/navigation';
import { OptimisticActs } from './optimistic-acts.svelte';
import { postEvolution, type EvolutionOp } from './reading-api';
import type { Patch, Patches } from './dossier-overlay';

// Provisional: how long an act waits for a reading of the request that another navigation took over, to be measured on real runs.
const TAKEN_OVER_MS = 5000;

/** Resolves once `reading` no longer returns `before`, or after `ms`. */
function changed(reading: () => unknown, before: unknown, ms: number): Promise<void> {
	const until = Date.now() + ms;
	return new Promise((done) => {
		const look = () => (reading() !== before || Date.now() >= until ? done() : requestAnimationFrame(look));
		look();
	});
}

/**
 * Every act a request page sends, optimistic (ac-evo-form-edit-optimistic):
 * the page reads its outcome the moment the person acts (`patches`, laid over
 * the request by `overlayDossier`), the operations save behind through the
 * same guarded route the MCP uses, and a refusal or a failure takes the
 * outcome off the page at once, an error toast saying what was not saved and
 * why. A second act on the same thing waits for the first (OptimisticActs).
 * Saving ends at the server's answer; accepted, the act stays as it was sent
 * until the request is read again after it (criteria 27bbfacd, b33f1a03).
 */
export class EvolutionWrites {
	readonly #acts = new OptimisticActs<Patch>();

	constructor(
		private readonly projectId: string,
		/** The request as the server last said, which changes once a save is read back; null where nothing reads it. */
		private readonly saved: (() => unknown) | null
	) {}

	/** What the acts sent and not read back yet change, by key. */
	get patches(): Patches {
		return this.#acts.all;
	}

	/**
	 * Sends one act: `patches` read at once, `operations` saved in one batch,
	 * `what` names the act in the toast when it is not saved. Once accepted, the
	 * request is read again, begun after the answer, and the act leaves when it
	 * lands; an act on what the page reads apart from the request (the actions of
	 * the Specification) gives `readAgain` too, and leaves once both are read.
	 */
	send(patches: Patches, operations: readonly EvolutionOp[], what: string, readAgain?: () => Promise<void>): Promise<boolean> {
		return this.#acts.runEach(patches, () => postEvolution(this.projectId, [...operations], { what }), {
			readAgain: async () => {
				await Promise.all([this.#readRequestAgain(), readAgain?.()]);
			}
		});
	}

	/** Reads the request again, begun after the answer; when a later navigation took that reading over, waits for it to land. */
	async #readRequestAgain(): Promise<void> {
		const saved = this.saved;
		const before = saved?.();
		await invalidateAll();
		if (saved && saved() === before) await changed(saved, before, TAKEN_OVER_MS);
	}
}

const KEY = Symbol('evolution-writes');

export function provideEvolutionWrites(writes: EvolutionWrites): void {
	setContext(KEY, writes);
}

/** The request page's writes; outside one (a card rendered on its own), writes of its own that only save. */
export function useEvolutionWrites(projectId: string): EvolutionWrites {
	return getContext<EvolutionWrites | undefined>(KEY) ?? new EvolutionWrites(projectId, null);
}
