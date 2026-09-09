import { createEmptyIdentityDraft, type FoundationIdentityDraft } from '$domain/foundation';

/**
 * Anti-corruption guard for untrusted draft payloads (HTTP body). Merges the
 * input over fresh defaults so every key exists with the right shape, and pins
 * the project id from the trusted source. Cheap and dependency-free; a stricter
 * schema (zod) can drop in later behind this same boundary.
 */
export function parseIdentityDraft(input: unknown, projectId: string): FoundationIdentityDraft {
	const base = createEmptyIdentityDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const str = (k: keyof FoundationIdentityDraft, fallback: string) =>
		typeof src[k] === 'string' ? (src[k] as string) : fallback;
	const arr = <T>(k: keyof FoundationIdentityDraft): T[] =>
		Array.isArray(src[k]) ? (src[k] as T[]) : [];

	return {
		...base,
		projectId,
		productName: str('productName', base.productName),
		industry: (src.industry as FoundationIdentityDraft['industry']) ?? base.industry,
		productType: (src.productType as FoundationIdentityDraft['productType']) ?? base.productType,
		brief: str('brief', base.brief),
		formFactors: arr('formFactors'),
		featureExpressionMode:
			(src.featureExpressionMode as FoundationIdentityDraft['featureExpressionMode']) ??
			base.featureExpressionMode,
		structuredRuleFormat:
			(src.structuredRuleFormat as FoundationIdentityDraft['structuredRuleFormat']) ??
			base.structuredRuleFormat,
		sourceMode: (src.sourceMode as FoundationIdentityDraft['sourceMode']) ?? base.sourceMode,
		activatedPatterns: Array.isArray(src.activatedPatterns)
			? (src.activatedPatterns as FoundationIdentityDraft['activatedPatterns'])
			: base.activatedPatterns,
		ruleFamilyDefaults:
			src.ruleFamilyDefaults && typeof src.ruleFamilyDefaults === 'object'
				? { ...base.ruleFamilyDefaults, ...(src.ruleFamilyDefaults as object) }
				: base.ruleFamilyDefaults,
		projectMode: (src.projectMode as FoundationIdentityDraft['projectMode']) ?? base.projectMode,
		mainProblem: str('mainProblem', base.mainProblem),
		painPoints: arr('painPoints'),
		expectedOutcome: str('expectedOutcome', base.expectedOutcome),
		kpis: arr('kpis'),
		successCriteria: arr('successCriteria'),
		failureCriteria: arr('failureCriteria'),
		marketType: (src.marketType as FoundationIdentityDraft['marketType']) ?? base.marketType,
		customerSize: arr('customerSize'),
		industrySectors: arr('industrySectors'),
		languages: arr('languages'),
		regulations: arr('regulations'),
		competitors: arr('competitors'),
		differentiators: arr('differentiators'),
		claimedCategory: str('claimedCategory', base.claimedCategory)
	};
}
