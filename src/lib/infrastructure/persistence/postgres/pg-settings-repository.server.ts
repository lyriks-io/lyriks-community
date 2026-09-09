import type { SettingsRepositoryPort } from '$application/ports';
import {
	defaultAiSettings,
	defaultFeedbackSettings,
	normalizeAiSettings,
	normalizeFeedbackSettings,
	type AiSettings,
	type FeedbackSettings
} from '$domain/settings';
import { pgQuery } from './pg-database.server';

/** Single-row settings store (one document per id); values normalized through the domain. */
const AI_ROW = 'ai';
const FEEDBACK_ROW = 'feedback';

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
}
