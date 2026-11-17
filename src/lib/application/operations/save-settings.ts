import { normalizeAiSettings, type AiSettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Persists app-level AI settings (normalized through the domain). */
export class SaveSettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	async execute(settings: unknown): Promise<AiSettings> {
		const normalized = normalizeAiSettings(settings);
		await this.repo.saveAi(normalized);
		return normalized;
	}
}
