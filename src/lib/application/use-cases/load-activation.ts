import { evaluateLicense, shouldAdvanceClockFloor, type LicenseView } from '$domain/licensing';
import type { ActivationRepositoryPort, ClockPort, LicenseVerifierPort } from '../ports';

/**
 * Resolves the current product activation state. Loads the stored key (if any),
 * re-verifies its signature offline, and folds the result against the clock into
 * a client-safe {@link LicenseView}. A stored-but-unverifiable key resolves to
 * `invalid` (not `unlicensed`) so operators can tell a tampered/foreign key from a
 * fresh, never-activated install.
 */
export class LoadActivationUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly verifier: LicenseVerifierPort,
		private readonly clock: ClockPort,
		/** Edition this install declares, so a key that does not cover it is refused. */
		private readonly installEdition: string | undefined = undefined
	) {}

	async execute(): Promise<LicenseView> {
		const now = this.clock.nowIso();
		const [stored, clockFloor] = await Promise.all([
			this.activations.load(),
			this.activations.readClockFloor()
		]);
		if (!stored) return evaluateLicense(null, null, now);
		const entitlements = this.verifier.verify(stored.key);
		// Witness the observed time so a later rollback becomes detectable — but
		// only while a signature-valid licence is stored: an unlicensed install with
		// a wrongly-future clock must not poison the floor and wedge its own future
		// activation. Throttled (domain policy, using the floor already in hand) and
		// best-effort: this read path must keep serving even if the write fails
		// (read-only replica, disk full) — a missed advance only widens the window
		// by one throttle period.
		if (entitlements && shouldAdvanceClockFloor(now, clockFloor)) {
			try {
				await this.activations.advanceClockFloor(now);
			} catch {
				// Best-effort witness — never let it break the licence read.
			}
		}
		return evaluateLicense(entitlements, stored.activatedAt, now, {
			absentStatus: 'invalid',
			clockFloorIso: clockFloor,
			installEdition: this.installEdition
		});
	}
}
