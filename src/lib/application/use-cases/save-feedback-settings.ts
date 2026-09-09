import { normalizeFeedbackSettings, type FeedbackSettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Persists app-level feedback-channel settings (normalized through the domain). */
export class SaveFeedbackSettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	async execute(settings: unknown): Promise<FeedbackSettings> {
		const normalized = normalizeFeedbackSettings(settings);
		await this.repo.saveFeedback(normalized);
		return normalized;
	}
}
