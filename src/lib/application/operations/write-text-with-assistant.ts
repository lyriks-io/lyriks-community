import { notationOfAnswer, textAssistantPrompt, textAssistantRetry, type TextAssistantInput } from '$domain/evolution';
import { assistantAvailable, assistantFailureSentence } from '$domain/settings';
import type { LanguageModelPort, SecretCipherPort, SettingsRepositoryPort } from '../ports';
import { assistantConnection } from './assistant-connection';

export type TextWritingOutcome =
	| { readonly ok: true; readonly text: string; readonly tries: number; readonly provider: string; readonly model: string }
	| { readonly ok: false; readonly kind: 'unavailable' | 'unreachable' | 'unreadable'; readonly reason: string };

/**
 * The built-in assistant rewrites a text the diagram moved past, from the
 * diagram (ac-evo-diagram-assistant). An answer that holds no text is asked
 * for once more, and nothing is written if the second holds none either.
 */
export class WriteTextWithAssistantUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly cipher: SecretCipherPort,
		private readonly model: LanguageModelPort
	) {}

	async execute(input: TextAssistantInput): Promise<TextWritingOutcome> {
		const stored = await this.repo.loadAssistant();
		if (!assistantAvailable(stored))
			return { ok: false, kind: 'unavailable', reason: 'The built-in assistant is not switched on on this installation: an administrator does it in Settings, or your own AI updates the text through the MCP.' };
		const opened = assistantConnection(stored, this.cipher);
		if (!opened.ok) return { ok: false, kind: 'unavailable', reason: opened.reason };
		const { connection } = opened;
		const said = { provider: connection.provider, model: connection.model };

		const first = textAssistantPrompt(input);
		let prompt = first;
		for (let tries = 1; tries <= 2; tries++) {
			const answer = await this.model.complete(connection, prompt);
			if (!answer.ok)
				return { ok: false, kind: 'unreachable', reason: `The assistant did not answer, so nothing was written. ${assistantFailureSentence(answer.failure, { ...said, detail: answer.detail })}` };
			// A model that fences its answer anyway is read through the fence, as a drawing is.
			const text = notationOfAnswer(answer.text);
			if (text !== '') return { ok: true, text, tries, ...said };
			prompt = textAssistantRetry(first);
		}
		return { ok: false, kind: 'unreadable', reason: 'The assistant answered with no text, even after a second try, so nothing was written. Try again.' };
	}
}
