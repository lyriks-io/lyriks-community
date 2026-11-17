import type { AiSettings, DisplaySettings, FeedbackSettings, InstallConfiguration, ProofSettings, StoredAssistant } from '$domain/settings';

/**
 * Outbound port for app-level settings persistence: one small document per
 * concern (AI switch, feedback channel switch, built-in assistant). Backed by
 * PostgreSQL today; the assistant's key reaches it already sealed.
 */
export interface SettingsRepositoryPort {
	loadAi(): Promise<AiSettings>;
	saveAi(settings: AiSettings): Promise<void>;
	loadFeedback(): Promise<FeedbackSettings>;
	saveFeedback(settings: FeedbackSettings): Promise<void>;
	loadInstallConfiguration(): Promise<InstallConfiguration>;
	saveInstallConfiguration(configuration: InstallConfiguration): Promise<void>;
	loadAssistant(): Promise<StoredAssistant>;
	loadDisplay(): Promise<DisplaySettings>;
	saveDisplay(settings: DisplaySettings): Promise<void>;
	saveAssistant(settings: StoredAssistant): Promise<void>;
	/** Whether the installation proves with the solver (Settings → Proofs); off when never set. */
	loadProofs(): Promise<ProofSettings>;
	saveProofs(settings: ProofSettings): Promise<void>;
}
