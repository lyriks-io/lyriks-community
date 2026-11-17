import { getContext, setContext } from 'svelte';
import { OptimisticActs } from './optimistic-acts.svelte';
import { applyEvolution, type EvolutionOp } from './reading-api';
import type { Patch, Patches } from './dossier-overlay';

/**
 * Every act a request page sends, optimistic (ac-evo-form-edit-optimistic):
 * the page reads its outcome the moment the person acts (`patches`, laid over
 * the request by `overlayDossier`), the operations save behind through the
 * same guarded route the MCP uses, and a refusal or a failure takes the
 * outcome off the page at once, an error toast saying what was not saved and
 * why. A second act on the same thing waits for the first (OptimisticActs).
 */
export class EvolutionWrites {
	readonly #acts = new OptimisticActs<Patch>();

	constructor(
		private readonly projectId: string,
		/** The request as the server last said, which changes once a save is read back. */
		private readonly saved: () => unknown
	) {}

	/** What the acts sent and not read back yet change, by key. */
	get patches(): Patches {
		return this.#acts.all;
	}

	/**
	 * Sends one act: `patches` read at once, `operations` saved in one batch,
	 * `what` names the act in the toast when it is not saved, `reading` is what
	 * changes once the save is read back (the request, by default).
	 */
	send(patches: Patches, operations: readonly EvolutionOp[], what: string, reading: () => unknown = this.saved): Promise<boolean> {
		return this.#acts.runEach(patches, () => applyEvolution(this.projectId, [...operations], { what }), reading);
	}
}

const KEY = Symbol('evolution-writes');

export function provideEvolutionWrites(writes: EvolutionWrites): void {
	setContext(KEY, writes);
}

/** The request page's writes; outside one (a card rendered on its own), writes of its own that only save. */
export function useEvolutionWrites(projectId: string): EvolutionWrites {
	return getContext<EvolutionWrites | undefined>(KEY) ?? new EvolutionWrites(projectId, () => null);
}
