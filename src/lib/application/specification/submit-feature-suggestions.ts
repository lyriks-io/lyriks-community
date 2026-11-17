import { parseFeatureSuggestions, type FeatureSuggestion } from '$domain/features';
import type { ProjectResidueRepositoryPort, SettingsRepositoryPort } from '../ports';
import { FEATURE_SUGGESTIONS_SECTION } from './suggest-features';

/** The Settings switch blocks the LLM from generating suggestions. */
export class SuggestionsBlockedError extends Error {
	constructor() {
		super('AI suggestions are blocked in Settings.');
		this.name = 'SuggestionsBlockedError';
	}
}

/**
 * The single way suggestions enter Lyriks: the operator's LLM, working through
 * the MCP, pushes a batch here. The app never generates suggestions itself.
 * Enforcement point for the Settings switch — blocked installs reject the
 * write. Each push replaces the previous batch (suggestions are a working set,
 * not history).
 */
export class SubmitFeatureSuggestionsUseCase {
	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly settings: SettingsRepositoryPort
	) {}

	async execute(projectId: string, input: unknown): Promise<FeatureSuggestion[]> {
		const { suggestionsEnabled } = await this.settings.loadAi();
		if (!suggestionsEnabled) throw new SuggestionsBlockedError();
		const suggestions = parseFeatureSuggestions(input);
		await this.residue.save(projectId, FEATURE_SUGGESTIONS_SECTION, { suggestions });
		return suggestions;
	}
}
