import { evaluateLicense, type LicenseView } from '$domain/licensing';
import type {
	ActivationRepositoryPort,
	AuditLogPort,
	ClockPort,
	LicenseVerifierPort
} from '../ports';

export type ActivationFailure =
	| 'empty'
	| 'invalid'
	| 'retired'
	| 'expired'
	| 'tampered'
	| 'wrong_edition';

export type ActivateLicenseResult =
	| { readonly ok: true; readonly view: LicenseView }
	| { readonly ok: false; readonly reason: ActivationFailure; readonly view: LicenseView };

/**
 * Activates the product from a raw licence key. The key is verified offline
 * against the bundled public key; only a valid, unexpired signature is stored.
 * Storing just the raw key (re-verified on every read) keeps the datastore
 * non-authoritative — it can hold a key but can never fabricate entitlements.
 * Every attempt is written to the audit trail.
 */
export class ActivateLicenseUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly verifier: LicenseVerifierPort,
		private readonly clock: ClockPort,
		private readonly audit: AuditLogPort,
		/** Edition this install declares, so a key that does not cover it is refused. */
		private readonly installEdition: string | undefined = undefined
	) {}

	async execute(rawKey: string, actor = 'anonymous'): Promise<ActivateLicenseResult> {
		const now = this.clock.nowIso();
		const key = rawKey.trim();

		const fail = (reason: ActivationFailure, view: LicenseView): ActivateLicenseResult => {
			this.audit.record({ action: 'license.activate', actor, outcome: 'failure', detail: reason });
			return { ok: false, reason, view };
		};

		if (!key) return fail('empty', evaluateLicense(null, null, now, { absentStatus: 'invalid' }));

		const entitlements = this.verifier.verify(key);
		if (!entitlements) {
			// A correctly-signed key from a signing authority we retired is a
			// different problem from a mistyped one, and only one of them is fixed by
			// asking us for a new key. Reporting both as 'invalid' sent the holder of
			// a genuine licence to re-check their clipboard.
			const reason: ActivationFailure = this.verifier.isRetired(key) ? 'retired' : 'invalid';
			return fail(reason, evaluateLicense(null, null, now, { absentStatus: 'invalid' }));
		}

		// Verify against the same clock floor the gate uses, so a key cannot be
		// (re-)activated while the clock is rolled back to disarm the tripwire.
		const clockFloor = await this.activations.readClockFloor();
		const view = evaluateLicense(entitlements, now, now, {
			absentStatus: 'invalid',
			clockFloorIso: clockFloor,
			installEdition: this.installEdition
		});
		// Refused here as well as at the gate, so a key that could never unlock this
		// install is never stored: it would otherwise sit in the datastore looking
		// activated and turn every later page load into the same refusal.
		if (view.status === 'wrong_edition') return fail('wrong_edition', view);
		if (view.status === 'tampered') return fail('tampered', view);
		if (view.status === 'expired') return fail('expired', view);

		await this.activations.save({ key, activatedAt: now });
		try {
			// Arm the rollback tripwire at the moment a licence starts existing.
			// Best-effort: the key is already saved, so a floor-write failure must not
			// report the activation as failed (the gate re-advances on later loads).
			await this.activations.advanceClockFloor(now);
		} catch {
			// Swallowed on purpose — see above.
		}
		this.audit.record({
			action: 'license.activate',
			actor,
			outcome: 'success',
			target: entitlements.licenseId,
			detail: `${entitlements.edition} · ${entitlements.seats} seats · expires ${entitlements.expiresAt ?? 'never'}`
		});
		return { ok: true, view };
	}
}
