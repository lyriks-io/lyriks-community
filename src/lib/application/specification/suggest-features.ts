import { parseFeatureSuggestions, type FeatureSuggestion } from '$domain/features';
import type {
	FeaturesDraftRepositoryPort,
	ProjectResidueRepositoryPort,
	SettingsRepositoryPort
} from '../ports';

/** Residue section holding the last batch of LLM-pushed feature suggestions. */
export const FEATURE_SUGGESTIONS_SECTION = 'feature-suggestions';

/**
 * Feature proposals for the Step 04 tree. Suggestions are only ever generated
 * by the operator's LLM through the MCP write path (SubmitFeatureSuggestions);
 * this use-case serves the stored batch back to the card — empty when the
 * Settings switch blocks AI suggestions, when nothing was pushed, or when
 * there's no draft. Titles already in the tree are filtered out.
 */
export class SuggestFeaturesUseCase {
	constructor(
		private readonly drafts: FeaturesDraftRepositoryPort,
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly settings: SettingsRepositoryPort
	) {}

	async execute(projectId: string): Promise<FeatureSuggestion[]> {
		const { suggestionsEnabled } = await this.settings.loadAi();
		if (!suggestionsEnabled) return [];
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		const stored = (await this.residue.load(projectId, FEATURE_SUGGESTIONS_SECTION)) as {
			suggestions?: unknown;
		} | null;
		const suggestions = parseFeatureSuggestions(stored?.suggestions);
		const taken = new Set(draft.features.map((f) => f.name.trim().toLowerCase()));
		return suggestions.filter((s) => !taken.has(s.title.trim().toLowerCase()));
	}
}
