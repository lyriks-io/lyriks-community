import type { AiSettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Reads the app-level AI settings. */
export class LoadSettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	execute(): Promise<AiSettings> {
		return this.repo.loadAi();
	}
}
