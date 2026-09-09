import { evaluateLicense, type LicenseView } from '$domain/licensing';
import type { ActivationRepositoryPort, ClockPort, LicenseVerifierPort } from '../ports';
import type { ActivationFailure } from './activate-license';

export type PreviewLicenseResult =
	| { readonly ok: true; readonly view: LicenseView }
	| { readonly ok: false; readonly reason: ActivationFailure; readonly view: LicenseView };

/**
 * Answer what a licence key WOULD grant this install, without storing it.
 *
 * Replacing a licence is the one operator action whose outcome used to be
 * invisible until it had already happened: paste, and the working key is gone.
 * A renewal that verifies can still grant less than expected (fewer seats, a
 * shorter window, an edition that does not cover a planned upgrade), and the
 * only way to find that out was to commit to it.
 *
 * So this runs the exact same checks as {@link ActivateLicenseUseCase} against
 * the same clock floor and the same declared edition, and returns the same
 * result shape. Anything else would make the preview a different opinion from
 * the activation, which is worse than no preview at all: the operator would
 * trust a verdict that does not bind. It writes nothing, records nothing, and
 * cannot advance the clock floor.
 */
export class PreviewLicenseUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly verifier: LicenseVerifierPort,
		private readonly clock: ClockPort,
		/** Edition this install declares, so a key that does not cover it is refused. */
		private readonly installEdition: string | undefined = undefined
	) {}

	async execute(rawKey: string): Promise<PreviewLicenseResult> {
		const now = this.clock.nowIso();
		const key = rawKey.trim();
		const nothing = (reason: ActivationFailure): PreviewLicenseResult => ({
			ok: false,
			reason,
			view: evaluateLicense(null, null, now, { absentStatus: 'invalid' })
		});

		if (!key) return nothing('empty');

		const entitlements = this.verifier.verify(key);
		if (!entitlements) return nothing(this.verifier.isRetired(key) ? 'retired' : 'invalid');

		const clockFloor = await this.activations.readClockFloor();
		const view = evaluateLicense(entitlements, now, now, {
			absentStatus: 'invalid',
			clockFloorIso: clockFloor,
			installEdition: this.installEdition
		});
		if (view.status === 'wrong_edition') return { ok: false, reason: 'wrong_edition', view };
		if (view.status === 'tampered') return { ok: false, reason: 'tampered', view };
		if (view.status === 'expired') return { ok: false, reason: 'expired', view };
		return { ok: true, view };
	}
}
