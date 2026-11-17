import type { DisplaySettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Reads the app-level display settings (how long New lasts). */
export class LoadDisplaySettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	execute(): Promise<DisplaySettings> {
		return this.repo.loadDisplay();
	}
}
