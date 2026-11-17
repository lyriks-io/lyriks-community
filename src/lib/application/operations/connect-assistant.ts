import { assistantView, connectAssistant, isAssistantProvider, keyHintOf, type AssistantSettings } from '$domain/settings';
import type { ClockPort, SecretCipherPort, SettingsRepositoryPort } from '../ports';

export type AssistantSettingsOutcome = { readonly ok: true; readonly settings: AssistantSettings } | { readonly ok: false; readonly reason: string };

/**
 * Connect the built-in assistant for everybody (ac-adm-ai-central): the key is
 * sealed before it is stored, and a key left empty keeps the stored one.
 */
export class ConnectAssistantUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly cipher: SecretCipherPort,
		private readonly clock: ClockPort
	) {}

	async execute(input: { readonly provider: unknown; readonly model: unknown; readonly apiKey: unknown; readonly by: string }): Promise<AssistantSettingsOutcome> {
		if (!isAssistantProvider(input.provider)) return { ok: false, reason: 'Choose the provider: Claude, by Anthropic, or OpenAI.' };
		const key = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
		const change = connectAssistant(
			await this.repo.loadAssistant(),
			{
				provider: input.provider,
				model: typeof input.model === 'string' ? input.model : '',
				key: key === '' ? null : { sealed: this.cipher.seal(key), hint: keyHintOf(key) }
			},
			{ at: this.clock.nowIso(), by: input.by }
		);
		if (!change.ok) return change;
		await this.repo.saveAssistant(change.stored);
		return { ok: true, settings: assistantView(change.stored) };
	}
}
