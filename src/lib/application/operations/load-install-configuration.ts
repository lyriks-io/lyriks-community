import {
	DEFAULT_SPEC_LANGUAGE,
	outboundAllowance,
	type InstallChoices,
	type OutboundAllowance
} from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** The form as it should open, and whether anybody has answered it yet. */
export interface InstallConfigurationView extends InstallChoices {
	readonly validated: boolean;
	readonly validatedAt: string | null;
	readonly validatedBy: string | null;
}

/**
 * Reads the configuration of the installation.
 *
 * `updateCheckPreset` is what the host prepared (`LYRIKS_UPDATE_CHECK=1`): it only
 * ticks the box the administrator is about to answer, and allows nothing itself.
 */
export class LoadInstallConfigurationUseCase {
	constructor(
		private readonly repo: Pick<SettingsRepositoryPort, 'loadInstallConfiguration' | 'loadFeedback'>,
		private readonly updateCheckPreset: boolean
	) {}

	async execute(): Promise<InstallConfigurationView> {
		const [configuration, feedback] = await Promise.all([
			this.repo.loadInstallConfiguration(),
			this.repo.loadFeedback()
		]);
		const validated = configuration.validatedAt !== null;
		return {
			validated,
			validatedAt: configuration.validatedAt,
			validatedBy: configuration.validatedBy,
			updateCheck: validated ? configuration.updateCheck : this.updateCheckPreset,
			feedbackOnline: feedback.onlineEnabled,
			onlineHelp: configuration.onlineHelp,
			specLanguage: configuration.specLanguage || DEFAULT_SPEC_LANGUAGE
		};
	}

	/** What may leave right now, for the code about to send something out. */
	async allowance(): Promise<OutboundAllowance> {
		const [configuration, feedback] = await Promise.all([
			this.repo.loadInstallConfiguration(),
			this.repo.loadFeedback()
		]);
		return outboundAllowance(configuration, feedback);
	}

	/** The language a new project starts in; empty while nobody has chosen one. */
	async preferredSpecLanguage(): Promise<string> {
		return (await this.repo.loadInstallConfiguration()).specLanguage;
	}
}
