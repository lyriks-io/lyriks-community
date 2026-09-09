import type { FoundationIdentityDraft } from '$domain/foundation';
import type { AiSuggesterPort, PersonaSuggestion } from '../ports';

/**
 * Asks the AI seam for end-user / back-office personas to propose on the Users
 * step. Backed today by the deterministic stub; an MCP advisor can
 * replace the adapter behind the same port without touching callers.
 */
export class SuggestPersonasUseCase {
	constructor(private readonly ai: AiSuggesterPort) {}

	execute(brief: string, draft: FoundationIdentityDraft): Promise<PersonaSuggestion[]> {
		return this.ai.suggestPersonas(brief, draft);
	}
}
