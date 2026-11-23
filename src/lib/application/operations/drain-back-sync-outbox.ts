import type { BackSyncOutboxPort } from '../ports';

/** The envelope push the drain retries — PushEnvelopeToBackUseCase's surface. */
interface EnvelopePusher {
	/** Resolves true when the envelope landed on Back; never rejects by design. */
	execute(projectId: string): Promise<boolean>;
}

/** Projects worked per drain pass; the next pass (timer or save) takes the rest. */
const DRAIN_BATCH_LIMIT = 25;

/**
 * Drain worker for the durable back-sync outbox (persistence-sync-remaining,
 * item 5): claim the due projects and re-push each project's CURRENT envelope.
 * Success closes the gap (row deleted); failure counts the attempt and backs
 * off (the outbox owns the schedule). Runs from two triggers — the ~30s timer
 * at the composition root and the immediate kick after every save — and never
 * rejects, so both can fire-and-forget it.
 *
 * One pass at a time per process (in-flight flag): an overlapping trigger
 * returns immediately instead of double-claiming; the row lease in the PG
 * adapter provides the same guarantee across replicas.
 */
export class DrainBackSyncOutboxUseCase {
	constructor(
		private readonly outbox: BackSyncOutboxPort,
		private readonly pushEnvelope: EnvelopePusher,
		/**
		 * Whether Back could take a push now. Where it answers a signed-in person
		 * only, a pass with nobody signed in would fail every row and count it
		 * (criterion b7048daa): it does not run.
		 */
		private readonly canPushNow: () => boolean = () => true
	) {}

	#inFlight = false;

	async execute(): Promise<void> {
		if (this.#inFlight || !this.canPushNow()) return;
		this.#inFlight = true;
		try {
			const due = await this.outbox.due(DRAIN_BATCH_LIMIT);
			for (const projectId of due) {
				await this.#push(projectId);
			}
		} catch (e) {
			console.warn(
				'[lyriks-back] outbox drain failed:',
				e instanceof Error ? e.message : e
			);
		} finally {
			this.#inFlight = false;
		}
	}

	/**
	 * One project, under the person whose request runs it: a save sends the copy
	 * of the project saved and never another's, and a page of a project whose
	 * copy still waits sends it with the sign-in of the person who writes there
	 * (criterion b7048daa). Nothing when the copy is up to date. Never rejects.
	 */
	async executeFor(projectId: string): Promise<void> {
		if (!this.canPushNow()) return;
		const queued = await this.outbox.isQueued(projectId).catch(() => false);
		if (queued) await this.#push(projectId);
	}

	/** One project: push, then settle the outbox row. Never rejects. */
	async #push(projectId: string): Promise<void> {
		let failure: string;
		try {
			if (await this.pushEnvelope.execute(projectId)) {
				await this.outbox.succeeded(projectId);
				return;
			}
			failure = 'envelope push to back failed (back unreachable or project unresolved)';
		} catch (e) {
			failure = `envelope push threw: ${e instanceof Error ? e.message : String(e)}`;
		}
		await this.outbox
			.failed(projectId, failure)
			.catch((e) =>
				console.warn(
					`[lyriks-back] recording outbox failure failed [${projectId}]:`,
					e instanceof Error ? e.message : e
				)
			);
	}
}
