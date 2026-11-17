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
 * One piece of the project's own text a persona suggestion may be read from:
 * the brief, the problem, a pain point, the expected outcome, or a persona the
 * author once typed as free text. `where` is how the card names its origin.
 */
export interface PersonaContextPassage {
	where: 'brief' | 'problem' | 'pain point' | 'outcome' | 'affected persona';
	text: string;
}

/**
 * A proposed user persona for the Users step. It is always read from the
 * project's own context (spec criterion `98d98033`), never a generic default:
 * `rationale` quotes the passage it came from.
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
	/** Propose the personas the project's own text names; none when it names nobody. */
	suggestPersonas(context: readonly PersonaContextPassage[]): Promise<PersonaSuggestion[]>;
}
