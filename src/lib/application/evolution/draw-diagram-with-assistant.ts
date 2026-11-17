import {
	checkDrawing,
	diagramAssistantPrompt,
	diagramAssistantRetry,
	notationOfAnswer,
	type DiagramAssistantInput
} from '$domain/evolution';
import { assistantAvailable, assistantFailureSentence } from '$domain/settings';
import type { LanguageModelPort, SecretCipherPort, SettingsRepositoryPort } from '../ports';
import { assistantConnection } from '../operations/assistant-connection';

export type DrawingOutcome =
	| { readonly ok: true; readonly notation: string; readonly tries: number; readonly provider: string; readonly model: string }
	| { readonly ok: false; readonly kind: 'unavailable' | 'unreachable' | 'unreadable'; readonly reason: string };

/**
 * The built-in assistant draws a step's diagram from its texts
 * (ac-evo-diagram-assistant). A drawing that does not read is asked for once
 * more with what was wrong with it, and still not written if it does not read
 * then; a drawing that reads but leaves something unclear (a name drawn
 * without being declared) is asked for once more too, and kept when the
 * second answer does not read or does not come.
 */
export class DrawDiagramWithAssistantUseCase {
	constructor(
		private readonly repo: SettingsRepositoryPort,
		private readonly cipher: SecretCipherPort,
		private readonly model: LanguageModelPort
	) {}

	async execute(input: DiagramAssistantInput): Promise<DrawingOutcome> {
		const stored = await this.repo.loadAssistant();
		if (!assistantAvailable(stored))
			return { ok: false, kind: 'unavailable', reason: 'The built-in assistant is not switched on on this installation: an administrator does it in Settings, or your own AI redraws the diagram through the MCP.' };
		const opened = assistantConnection(stored, this.cipher);
		if (!opened.ok) return { ok: false, kind: 'unavailable', reason: opened.reason };
		const { connection } = opened;
		const said = { provider: connection.provider, model: connection.model };

		const first = diagramAssistantPrompt(input);
		let prompt = first;
		let best: { notation: string; tries: number } | null = null;
		for (let tries = 1; tries <= 2; tries++) {
			const answer = await this.model.complete(connection, prompt);
			if (!answer.ok) {
				if (best) break;
				return { ok: false, kind: 'unreachable', reason: `The assistant did not answer, so nothing was written. ${assistantFailureSentence(answer.failure, { ...said, detail: answer.detail })}` };
			}
			const notation = notationOfAnswer(answer.text);
			const check = checkDrawing(input.step, notation);
			if (check.reads && (check.clean || best === null || tries === 2)) best = { notation, tries };
			if (check.clean) break;
			prompt = diagramAssistantRetry(first, notation, check.problems);
		}
		if (!best) return { ok: false, kind: 'unreadable', reason: "The assistant's drawing did not read, even after a second try, so nothing was written. Try again, or draw it on the page." };
		return { ok: true, ...best, ...said };
	}
}
