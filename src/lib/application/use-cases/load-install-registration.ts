import { formatRegistrationCode } from '$domain/licensing';
import type { ActivationRepositoryPort, ClockPort } from '../ports';

/**
 * Resolves the code an operator can hand back to lyriks.io to register this
 * installation. Reading it mints the install identity on first call and returns
 * the same value forever after, so the code shown on the activation screen is
 * stable across restarts, key replacements and upgrades.
 *
 * Nothing is transmitted: this use-case only formats a local identifier for
 * display. Whether it ever reaches us is the operator's decision.
 */
export class LoadInstallRegistrationUseCase {
	constructor(
		private readonly activations: ActivationRepositoryPort,
		private readonly clock: ClockPort
	) {}

	async execute(): Promise<string> {
		return formatRegistrationCode(await this.activations.ensureInstallId(this.clock.nowIso()));
	}
}
