import { assistantFailureSentence, assistantView, recordAssistantTest, type AssistantSettings } from '$domain/settings';
import type { ClockPort, LanguageModelPort, SecretCipherPort, SettingsRepositoryPort } from '../ports';
import { assistantConnection } from './assistant-connection';

const PROBE = { system: 'You answer connection checks.', prompt: 'Answer with the single word OK.' };

/**
 * One small call with what is set, said in plain words (ac-adm-ai-test). It
 * goes out whether the assistant is switched on or not: testing is how an
 * administrator decides to switch it on.
 */
export class TestAssistantUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly cipher: SecretCipherPort,
		private readonly model: LanguageModelPort,
		private readonly clock: ClockPort
	) {}

	async execute(): Promise<{ readonly ok: true; readonly settings: AssistantSettings } | { readonly ok: false; readonly reason: string }> {
		const stored = await this.repo.loadAssistant();
		const opened = assistantConnection(stored, this.cipher);
		if (!opened.ok) return opened;
		const answer = await this.model.complete(opened.connection, PROBE);
		const tested = recordAssistantTest(
			stored,
			answer.ok
				? { works: true, detail: null }
				: { works: false, detail: assistantFailureSentence(answer.failure, { provider: stored.provider, model: opened.connection.model, detail: answer.detail }) },
			this.clock.nowIso()
		);
		await this.repo.saveAssistant(tested);
		return { ok: true, settings: assistantView(tested) };
	}
}
