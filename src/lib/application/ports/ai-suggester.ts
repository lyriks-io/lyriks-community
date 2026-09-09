import type {
	FormFactorCode,
	MarketTypeCode,
	FoundationIdentityDraft,
	SuggestableSection
} from '$domain/foundation';

/** Structured result of analyzing the free-form brief. */
export interface BriefAnalysis {
	suggestedFormFactors: FormFactorCode[];
	suggestedMarketType?: MarketTypeCode;
	suggestedPainPoints: string[];
	suggestedCompetitors: string[];
	/** Phrases the analysis emphasizes — drives the "auto-analyzed" highlighting. */
	highlights: string[];
}

/**
 * A per-section suggestion: a partial draft patch the UI can present in a diff
 * view for accept/reject, plus how many items it proposes.
 */
export interface SectionSuggestion {
	section: SuggestableSection;
	patch: Partial<FoundationIdentityDraft>;
	itemCount: number;
}

/**
 * A proposed user persona for the Users step — pushed by the AI seam (today the
 * stub; tomorrow an MCP advisor) and accept-on-click in the UI.
 */
export interface PersonaSuggestion {
	name: string;
	rationale: string;
	userClass: 'end-user' | 'back-office';
}

/**
 * Outbound port for AI assistance. Backed today by a deterministic stub; a real
 * Claude adapter (server route + ANTHROPIC_API_KEY) can replace it without
 * touching callers.
 */
export interface AiSuggesterPort {
	analyzeBrief(brief: string): Promise<BriefAnalysis>;
	suggest(
		section: SuggestableSection,
		brief: string,
		draft: FoundationIdentityDraft
	): Promise<SectionSuggestion>;
	/** Propose end-user and back-office personas from the brief + project context. */
	suggestPersonas(brief: string, draft: FoundationIdentityDraft): Promise<PersonaSuggestion[]>;
}
