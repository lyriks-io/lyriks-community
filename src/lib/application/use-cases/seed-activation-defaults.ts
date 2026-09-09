import { displayNameFromLicenseCustomer } from '$domain/team/member-name';
import type { LicenseEntitlements } from '$domain/licensing';
import type { OperatorProfileRepositoryPort } from '../ports';

/**
 * Seeds install identity from a freshly accepted licence, so a new install
 * greets its operator by name instead of "Developer". The licence names its
 * customer, and that is the best default this appliance will ever have; but it
 * is only a DEFAULT: nothing already set is ever overwritten, and the operator
 * keeps editing their name from Settings afterwards.
 *
 * Community / solo only (`enabled`): Enterprise identity belongs to lyriks-back
 * accounts, where a person's name must not be invented from an organisation's.
 * Best-effort by design: activation has already succeeded, and a seeding
 * failure must never turn it into an error.
 */
export class SeedActivationDefaultsUseCase {
	constructor(
		private readonly operatorProfile: OperatorProfileRepositoryPort,
		/** False on Enterprise installs, where identity is back-owned. */
		private readonly enabled: boolean
	) {}

	async execute(entitlements: LicenseEntitlements | null): Promise<void> {
		if (!this.enabled) return;
		const name = displayNameFromLicenseCustomer(entitlements?.customer ?? '');
		if (!name) return;
		try {
			const profile = await this.operatorProfile.load();
			if (profile.displayName.trim()) return;
			await this.operatorProfile.save({ ...profile, displayName: name });
		} catch {
			// Best-effort, see the class doc.
		}
	}
}
