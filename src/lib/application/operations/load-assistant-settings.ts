import { assistantView, type AssistantSettings } from '$domain/settings';
import type { SettingsRepositoryPort } from '../ports';

/** Reads the built-in assistant's settings as any browser may see them: never the key (ac-adm-ai-key). */
export class LoadAssistantSettingsUseCase {
	constructor(private readonly repo: SettingsRepositoryPort) {}

	async execute(): Promise<AssistantSettings> {
		return assistantView(await this.repo.loadAssistant());
	}
}
