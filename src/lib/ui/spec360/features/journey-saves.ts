import { applyJourneyAct, type ActionJourney, type JourneyAct } from '$domain/features';

/** The server's answer to one act: the feature's journeys as saved, or why the act was refused. */
export type JourneySaveAnswer = { readonly ok: true; readonly journeys: readonly ActionJourney[] } | { readonly ok: false; readonly refusal: string };

export interface JourneySavesDeps {
	/** Sends one act; a network failure answers a refusal, never throws. */
	readonly send: (act: JourneyAct) => Promise<JourneySaveAnswer>;
	/** Reads the journeys as saved, after a refusal; null when they cannot be read. */
	readonly reread: () => Promise<readonly ActionJourney[] | null>;
	/** What the diagram shows now (null: the page's own read) and the refusal to say, if any. */
	readonly onview: (journeys: readonly ActionJourney[] | null, refusal: string | null) => void;
	/** Counts each save in the app's Saving indicator until it settles (criterion 27bbfacd). */
	readonly track?: <T>(save: Promise<T>, ok: (value: T) => boolean) => Promise<T>;
}

/**
 * The saves of one journeys diagram (criterion a8a7f1d5): each change shows at
 * once, computed by the same rules the server applies, and is saved behind it,
 * one after the other in the order made, so a click made while the server is
 * slow is never dropped. A refusal stops the changes still waiting, the
 * diagram reads again what is saved and the refusal says why.
 */
export class JourneySaves {
	#queue: JourneyAct[] = [];
	#draining = false;

	constructor(private readonly deps: JourneySavesDeps) {}

	/** How many changes are shown and not confirmed yet. */
	get waiting(): number {
		return this.#queue.length;
	}

	/** Shows `act` applied to what the diagram shows now and queues its save; answers the refusal and sends nothing when the rules refuse it. */
	apply(shown: readonly ActionJourney[], act: JourneyAct, actionIds: ReadonlySet<string>): string | null {
		const outcome = applyJourneyAct(shown, act, actionIds);
		if (!outcome.ok) return outcome.refusal;
		this.#queue.push(act);
		this.deps.onview(outcome.journeys, null);
		void this.#drain();
		return null;
	}

	async #drain(): Promise<void> {
		if (this.#draining) return;
		this.#draining = true;
		const track = this.deps.track ?? ((save) => save);
		let confirmed: readonly ActionJourney[] | null = null;
		try {
			while (this.#queue.length) {
				const answer = await track(this.deps.send(this.#queue[0]), (a: JourneySaveAnswer) => a.ok);
				if (answer.ok) {
					confirmed = answer.journeys;
					this.#queue.shift();
					continue;
				}
				// What was drawn after the refused change stood on it: none of it is sent.
				this.#queue = [];
				const saved = await this.deps.reread();
				this.deps.onview(saved ?? confirmed, answer.refusal);
				return;
			}
			if (confirmed) this.deps.onview(confirmed, null);
		} finally {
			this.#draining = false;
		}
	}
}
