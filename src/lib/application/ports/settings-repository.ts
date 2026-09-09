import type { AiSettings, FeedbackSettings } from '$domain/settings';

/**
 * Outbound port for app-level settings persistence: one small document per
 * concern (AI switch, feedback channel switch). Backed by PostgreSQL today;
 * swap for a dedicated secret store without touching callers.
 */
export interface SettingsRepositoryPort {
	loadAi(): Promise<AiSettings>;
	saveAi(settings: AiSettings): Promise<void>;
	loadFeedback(): Promise<FeedbackSettings>;
	saveFeedback(settings: FeedbackSettings): Promise<void>;
}
