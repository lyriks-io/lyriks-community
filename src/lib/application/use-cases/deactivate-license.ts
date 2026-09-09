import type { ActivationRepositoryPort, AuditLogPort } from '../ports';

/**
 * Clears the stored licence key from this install (e.g. before moving the key to
 * another appliance, or to re-key). The product falls back to the unlicensed
 * state on the next request. Audited as a sensitive admin action.
 */
export class DeactivateLicenseUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly audit: AuditLogPort
	) {}

	async execute(actor = 'anonymous'): Promise<void> {
		await this.activations.clear();
		this.audit.record({ action: 'license.deactivate', actor, outcome: 'success' });
	}
}
