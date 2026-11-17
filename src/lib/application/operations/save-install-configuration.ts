import type { InstallChoices } from '$domain/settings';
import type { ClockPort } from '../ports/clock';
import type { SettingsRepositoryPort } from '../ports';

/**
 * Records an administrator's answer. The validation is written last, so a failure
 * half way leaves the installation shut rather than validated on partial choices.
 */
export class SaveInstallConfigurationUseCase {
	constructor(
		private readonly repo: Pick<SettingsRepositoryPort, 'saveInstallConfiguration' | 'saveFeedback'>,
		private readonly clock: ClockPort
	) {}

	async execute(choices: InstallChoices, actor: string): Promise<void> {
		await this.repo.saveFeedback({ onlineEnabled: choices.feedbackOnline });
		await this.repo.saveInstallConfiguration({
			updateCheck: choices.updateCheck,
			onlineHelp: choices.onlineHelp,
			specLanguage: choices.specLanguage,
			validatedAt: this.clock.nowIso(),
			validatedBy: actor
		});
	}
}
