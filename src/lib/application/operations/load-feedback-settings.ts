import type { FeedbackSettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Reads the app-level feedback-channel settings. */
export class LoadFeedbackSettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	execute(): Promise<FeedbackSettings> {
		return this.repo.loadFeedback();
	}
}
