import type { SettingsRepositoryPort } from '$application/ports';
import {
	defaultAiSettings,
	defaultDisplaySettings,
	defaultFeedbackSettings,
	defaultInstallConfiguration,
	defaultProofSettings,
	defaultStoredAssistant,
	normalizeAiSettings,
	normalizeDisplaySettings,
	normalizeFeedbackSettings,
	normalizeInstallConfiguration,
	normalizeProofSettings,
	normalizeStoredAssistant,
	type AiSettings,
	type DisplaySettings,
	type FeedbackSettings,
	type InstallConfiguration,
	type ProofSettings,
	type StoredAssistant
} from '$domain/settings';
import { pgQuery } from './pg-database.server';

/** Single-row settings store (one document per id); values normalized through the domain. */
const AI_ROW = 'ai';
const FEEDBACK_ROW = 'feedback';
const ASSISTANT_ROW = 'assistant';
const DISPLAY_ROW = 'display';
const PROOFS_ROW = 'proofs';
const INSTALL_CONFIGURATION_ROW = 'install_configuration';

export class PgSettingsRepository implements SettingsRepositoryPort {
	async loadAi(): Promise<AiSettings> {
		const document = await this.loadDocument(AI_ROW);
		if (document === null) return defaultAiSettings();
		try {
			return normalizeAiSettings(JSON.parse(document));
		} catch {
			return defaultAiSettings();
		}
	}

	async saveAi(settings: AiSettings): Promise<void> {
		await this.saveDocument(AI_ROW, normalizeAiSettings(settings));
	}

	async loadFeedback(): Promise<FeedbackSettings> {
		const document = await this.loadDocument(FEEDBACK_ROW);
		if (document === null) return defaultFeedbackSettings();
		try {
			return normalizeFeedbackSettings(JSON.parse(document));
		} catch {
			return defaultFeedbackSettings();
		}
	}

	async saveFeedback(settings: FeedbackSettings): Promise<void> {
		await this.saveDocument(FEEDBACK_ROW, normalizeFeedbackSettings(settings));
	}

	async loadInstallConfiguration(): Promise<InstallConfiguration> {
		const document = await this.loadDocument(INSTALL_CONFIGURATION_ROW);
		if (document === null) return defaultInstallConfiguration();
		try {
			return normalizeInstallConfiguration(JSON.parse(document));
		} catch {
			return defaultInstallConfiguration();
		}
	}

	async saveInstallConfiguration(configuration: InstallConfiguration): Promise<void> {
		await this.saveDocument(INSTALL_CONFIGURATION_ROW, normalizeInstallConfiguration(configuration));
	}

	async loadAssistant(): Promise<StoredAssistant> {
		const document = await this.loadDocument(ASSISTANT_ROW);
		if (document === null) return defaultStoredAssistant();
		try {
			return normalizeStoredAssistant(JSON.parse(document));
		} catch {
			return defaultStoredAssistant();
		}
	}

	async saveAssistant(settings: StoredAssistant): Promise<void> {
		await this.saveDocument(ASSISTANT_ROW, normalizeStoredAssistant(settings));
	}

	async loadDisplay(): Promise<DisplaySettings> {
		const document = await this.loadDocument(DISPLAY_ROW);
		if (document === null) return defaultDisplaySettings();
		try {
			return normalizeDisplaySettings(JSON.parse(document));
		} catch {
			return defaultDisplaySettings();
		}
	}

	async saveDisplay(settings: DisplaySettings): Promise<void> {
		await this.saveDocument(DISPLAY_ROW, normalizeDisplaySettings(settings));
	}

	private async loadDocument(id: string): Promise<string | null> {
		const { rows } = await pgQuery<{ document: string }>(
			'SELECT document FROM app_settings WHERE id = $1',
			[id]
		);
		return rows.length === 0 ? null : rows[0].document;
	}

	private async saveDocument(id: string, document: unknown): Promise<void> {
		await pgQuery(
			`INSERT INTO app_settings (id, document) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`,
			[id, JSON.stringify(document)]
		);
	}

	async loadProofs(): Promise<ProofSettings> {
		const document = await this.loadDocument(PROOFS_ROW);
		if (document === null) return defaultProofSettings();
		try {
			return normalizeProofSettings(JSON.parse(document));
		} catch {
			return defaultProofSettings();
		}
	}

	async saveProofs(settings: ProofSettings): Promise<void> {
		await this.saveDocument(PROOFS_ROW, normalizeProofSettings(settings));
	}
}
