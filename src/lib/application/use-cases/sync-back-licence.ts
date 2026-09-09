import type { ActivationRepositoryPort, BackLicenceSyncPort, ClockPort } from '../ports';

/** Minimum gap between throttled re-pushes, so the licence gate stays cheap. */
const RESYNC_THROTTLE_MS = 60_000;

/**
 * Keeps the Back's seat gate fed with the current activated key. The platform is
 * the licence authority; this use-case reads the stored raw key and pushes it to
 * the Back so a licensed install always resolves its true seat count.
 *
 * Called on activation and on boot (force), and throttled from the activation
 * read path so a Back that restarts is re-fed within a minute without a back call
 * on every request. Entirely best-effort: it never throws, so no delivery hiccup
 * can wall the app or fail an activation. When there is no Back (standalone) it
 * short-circuits before any work.
 */
export class SyncBackLicenceUseCase {
	#lastSyncAtMs: number | null = null;

	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly backLicence: BackLicenceSyncPort,
		private readonly clock: ClockPort
	) {}

	/**
	 * Push the stored key to the Back. `force` bypasses the throttle (use on
	 * activation and boot); the throttled form is safe to call on every activation
	 * read. Returns whether a push was actually attempted.
	 */
	async execute(force = false): Promise<boolean> {
		if (!this.backLicence.enabled) return false;
		const nowMs = Date.parse(this.clock.nowIso());
		if (!force && this.#lastSyncAtMs !== null && nowMs - this.#lastSyncAtMs < RESYNC_THROTTLE_MS) {
			return false;
		}
		this.#lastSyncAtMs = nowMs;
		try {
			const stored = await this.activations.load();
			await this.backLicence.sync(stored?.key ?? null);
		} catch {
			// Best-effort, see the class doc.
		}
		return true;
	}
}
