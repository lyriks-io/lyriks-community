import { assistantView, switchAssistant } from '$domain/settings';
import type { ClockPort, SettingsRepositoryPort } from '../ports';
import type { AssistantSettingsOutcome } from './connect-assistant';

/** Switch the built-in assistant on or off for everybody; on needs a connection. */
export class SwitchAssistantUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly clock: ClockPort
	) {}

	async execute(on: boolean, by: string): Promise<AssistantSettingsOutcome> {
		const change = switchAssistant(await this.repo.loadAssistant(), on, { at: this.clock.nowIso(), by });
		if (!change.ok) return change;
		await this.repo.saveAssistant(change.stored);
		return { ok: true, settings: assistantView(change.stored) };
	}
}
