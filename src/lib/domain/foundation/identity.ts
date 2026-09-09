import type { CustomizableCode } from '$domain/shared';
import { ALL_RULE_PATTERN_CODES } from './identity-enums';
import type {
	CustomerSizeCode,
	FeatureExpressionModeCode,
	FormFactorCode,
	IndustryCode,
	MarketTypeCode,
	ProductTypeCode,
	ProjectModeCode,
	RuleFamilyCode,
	RulePatternCode,
	SourceModeCode
} from './identity-enums';

/** Default structured pattern chosen per rule family (the Step-06 selector profile). */
export type RuleFamilyDefaults = Record<RuleFamilyCode, RulePatternCode>;

/** A measurable target. Order is meaningful (rendered as a table). */
export interface KpiEntry {
	name: string;
	currentValue: number | null;
	targetValue: number | null;
	unit: string;
}

/** A direct competitor with editable strengths / weaknesses. */
export interface CompetitorEntry {
	name: string;
	logoUrl: string | null;
	strengths: string[];
	weaknesses: string[];
}

/**
 * The persisted project identity + brief. Business objective, market and
 * competition are owned by the Foundation definition slice.
 *
 * The legacy definition-shaped fields below remain on the TypeScript contract
 * for one compatibility window so old rows can be migrated without losing data.
 * They are never edited or scored by the identity slice and are stripped from
 * new identity writes by `withoutLegacyDefinitionFields`.
 */
export interface FoundationIdentityDraft {
	projectId: string;

	/* identity */
	productName: string;
	industry: CustomizableCode<IndustryCode>;
	productType: CustomizableCode<ProductTypeCode>;

	/* brief */
	brief: string;

	/* form factor */
	formFactors: FormFactorCode[];

	/* methodology */
	featureExpressionMode: FeatureExpressionModeCode;
	structuredRuleFormat: RulePatternCode;

	/* origin */
	sourceMode: SourceModeCode;

	/* workspace insights */
	activatedPatterns: RulePatternCode[];
	ruleFamilyDefaults: RuleFamilyDefaults;

	/* mode */
	projectMode: ProjectModeCode;

	/** @deprecated Migration input only. Canonical owner: FoundationDefinitionDraft.businessObjective. */
	mainProblem: string;
	painPoints: string[];
	expectedOutcome: string;
	kpis: KpiEntry[];
	successCriteria: string[];
	failureCriteria: string[];

	/** @deprecated Migration input only. Canonical owner: FoundationDefinitionDraft.market. */
	marketType: CustomizableCode<MarketTypeCode>;
	customerSize: CustomerSizeCode[];
	industrySectors: string[];
	languages: string[];
	regulations: string[];

	/** @deprecated Migration input only. Canonical owner: FoundationDefinitionDraft.competition. */
	competitors: CompetitorEntry[];
	differentiators: string[];
	claimedCategory: string;

	/* meta */
	lastSavedAt: string | null;
}

/**
 * Default structured pattern per rule family, transcribed from the spec's
 * `init.ruleFamilyDefaults` default. Fresh object per call (never share a
 * reference across drafts).
 */
export function createDefaultRuleFamilyDefaults(): RuleFamilyDefaults {
	return {
		pricing_money: 'equation',
		access_security: 'decision_table',
		data_validation: 'equation',
		sla_quality: 'equation',
		compliance_legal: 'gherkin',
		workflow_state: 'equation',
		ux_behavior: 'equation',
		ai_guardrail: 'plain_text'
	};
}

/** Default values, transcribed from the spec's `defaultValue` per state def. */
export function createEmptyIdentityDraft(projectId: string): FoundationIdentityDraft {
	return {
		projectId,
		productName: '',
		industry: 'saas',
		productType: 'production_product',
		brief: '',
		formFactors: [],
		featureExpressionMode: 'user_story',
		structuredRuleFormat: 'gherkin',
		sourceMode: 'greenfield',
		activatedPatterns: [...ALL_RULE_PATTERN_CODES],
		ruleFamilyDefaults: createDefaultRuleFamilyDefaults(),
		projectMode: 'solo',
		lastSavedAt: null
	} as unknown as FoundationIdentityDraft;
}

/**
 * Remove the retired definition copy before persisting the identity slice. The
 * cast is temporary while the compatibility fields remain on
 * `FoundationIdentityDraft` for old callers; runtime documents produced by this
 * function contain only the canonical identity fields.
 */
export function withoutLegacyDefinitionFields(
	draft: FoundationIdentityDraft
): FoundationIdentityDraft {
	const {
		mainProblem: _mainProblem,
		painPoints: _painPoints,
		expectedOutcome: _expectedOutcome,
		kpis: _kpis,
		successCriteria: _successCriteria,
		failureCriteria: _failureCriteria,
		marketType: _marketType,
		customerSize: _customerSize,
		industrySectors: _industrySectors,
		languages: _languages,
		regulations: _regulations,
		competitors: _competitors,
		differentiators: _differentiators,
		claimedCategory: _claimedCategory,
		...canonical
	} = draft;
	return canonical as FoundationIdentityDraft;
}

export function createKpi(): KpiEntry {
	return { name: '', currentValue: null, targetValue: null, unit: '%' };
}

export function createCompetitor(name: string): CompetitorEntry {
	return { name, logoUrl: null, strengths: [], weaknesses: [] };
}

/** Hard cap from the feature-level invariant "Differentiators capped at 5". */
export const MAX_DIFFERENTIATORS = 5;
