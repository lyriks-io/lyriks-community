import type { ActivationRepositoryPort, AuditLogPort } from '../ports';

/**
 * Removes the stored licence key from this install (e.g. before moving the key
 * to another appliance, or to re-key). The product falls back to the
 * unlicensed state on the next request. The previous key stays unless the
 * person removes it too: it is what makes a key change reversible, so one
 * click must not take it away with the key it backs up. Audited as a
 * sensitive admin action.
 */
export class DeactivateLicenseUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly audit: AuditLogPort
	) {}

	async execute(actor = 'anonymous', options: { readonly previousToo?: boolean } = {}): Promise<void> {
		if (options.previousToo) await this.activations.clear();
		else await this.activations.removeCurrent();
		this.audit.record({
			action: 'license.deactivate',
			actor,
			outcome: 'success',
			detail: options.previousToo ? 'previous key removed too' : 'previous key kept'
		});
	}
}
