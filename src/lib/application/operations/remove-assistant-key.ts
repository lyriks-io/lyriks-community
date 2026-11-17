import { assistantView, removeAssistantKey, type AssistantSettings } from '$domain/settings';
import type { ClockPort, SettingsRepositoryPort } from '../ports';

/** Delete the stored key, which switches the built-in assistant off. */
export class RemoveAssistantKeyUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly clock: ClockPort
	) {}

	async execute(by: string): Promise<AssistantSettings> {
		const removed = removeAssistantKey(await this.repo.loadAssistant(), { at: this.clock.nowIso(), by });
		await this.repo.saveAssistant(removed);
		return assistantView(removed);
	}
}
