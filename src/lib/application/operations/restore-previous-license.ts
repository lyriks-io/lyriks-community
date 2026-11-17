import { evaluateLicense, type LicenseView } from '$domain/licensing';
import type {
	ActivationRepositoryPort,
	AuditLogPort,
	ClockPort,
	LicenseVerifierPort
} from '../ports';

export type RestorePreviousFailure = 'none' | 'invalid' | 'expired' | 'tampered' | 'wrong_edition';

export type RestorePreviousLicenseResult =
	| { readonly ok: true; readonly view: LicenseView }
	| { readonly ok: false; readonly reason: RestorePreviousFailure; readonly view: LicenseView };

/**
 * Put the key this install ran on before the current one back in place.
 *
 * The point of keeping a superseded key is that swapping licences stops being a
 * one-way door: an operator can try the renewal they were sent, look at what it
 * actually grants, and step back if it is not what was agreed. Without this the
 * only way back was finding the old key in an inbox, which is exactly the
 * moment nobody can.
 *
 * The old key is re-verified rather than trusted: it may itself have expired
 * while the new one was in place, and an install must never be walked back into
 * a state the gate would refuse anyway. A refusal leaves the current key alone.
 */
export class RestorePreviousLicenseUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly verifier: LicenseVerifierPort,
		private readonly clock: ClockPort,
		private readonly audit: AuditLogPort,
		private readonly installEdition: string | undefined = undefined
	) {}

	async execute(actor = 'anonymous'): Promise<RestorePreviousLicenseResult> {
		const now = this.clock.nowIso();
		const fail = (
			reason: RestorePreviousFailure,
			view: LicenseView
		): RestorePreviousLicenseResult => {
			this.audit.record({
				action: 'license.restore_previous',
				actor,
				outcome: 'failure',
				detail: reason
			});
			return { ok: false, reason, view };
		};
		const absent = evaluateLicense(null, null, now, { absentStatus: 'invalid' });

		const previous = await this.activations.loadPrevious();
		if (!previous) return fail('none', absent);

		const entitlements = this.verifier.verify(previous.key);
		if (!entitlements) return fail('invalid', absent);

		const clockFloor = await this.activations.readClockFloor();
		const view = evaluateLicense(entitlements, now, now, {
			absentStatus: 'invalid',
			clockFloorIso: clockFloor,
			installEdition: this.installEdition
		});
		if (view.status === 'wrong_edition') return fail('wrong_edition', view);
		if (view.status === 'tampered') return fail('tampered', view);
		if (view.status === 'expired') return fail('expired', view);

		// save() demotes what it replaces, so restoring swaps the two rather than
		// dropping the key being stepped away from: an operator who restores by
		// mistake can go straight back to the newer key.
		await this.activations.save({ key: previous.key, activatedAt: now });
		this.audit.record({
			action: 'license.restore_previous',
			actor,
			outcome: 'success',
			target: entitlements.licenseId,
			detail: `${entitlements.edition} · ${entitlements.seats} seats · expires ${entitlements.expiresAt ?? 'never'}`
		});
		return { ok: true, view };
	}
}
