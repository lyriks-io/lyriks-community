import { parseDisplaySettings, type DisplaySettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Persists the app-level display settings, refusing a value out of range (criterion 8c1e9288). */
export class SaveDisplaySettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	async execute(input: unknown): Promise<{ ok: true; settings: DisplaySettings } | { ok: false; refusal: string }> {
		const parsed = parseDisplaySettings(input);
		if (parsed.ok) await this.repo.saveDisplay(parsed.settings);
		return parsed;
	}
}
