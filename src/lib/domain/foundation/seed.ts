import { createCompetitor, type CompetitorEntry, type FoundationIdentityDraft } from './identity';
import { createPainPointLink, type FoundationDefinitionDraft } from './definition';

/**
 * Seed the Business objective / Market segment / Competition sections from the
 * identity slice the first time the definition slice is opened. Each slice is
 * only seeded when it is still entirely empty (untouched), so this is
 * idempotent and never clobbers edits the user has made here. Definition-only
 * fields (affected personas, cost quantification, indirect competitors,
 * positioning, moat) have no identity source and are left at their defaults.
 *
 * Pure: returns a new draft, mutates nothing.
 */
/**
 * An identity-slice competitor, coerced to the full shape the definition
 * sections render.
 *
 * The row is NOT trustworthy: a competitor authored programmatically (MCP) or by
 * an older build can be a bare string, or an object with no `strengths` /
 * `weaknesses`. Spreading those directly threw `x.strengths is not iterable` and
 * took down every page that loads the definition draft — including the home
 * dashboard, which loads it for every project to score coherence. The definition
 * draft parser already defends this exact shape; the seeder has to defend it too.
 */
function normalizeCompetitor(raw: unknown): CompetitorEntry {
	if (typeof raw === 'string') return createCompetitor(raw);
	const row = (raw ?? {}) as Partial<Record<keyof CompetitorEntry, unknown>>;
	const list = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
	return {
		name: typeof row.name === 'string' ? row.name : '',
		logoUrl: typeof row.logoUrl === 'string' ? row.logoUrl : null,
		strengths: list(row.strengths),
		weaknesses: list(row.weaknesses)
	};
}

export function seedDefinitionFromIdentity(
	definition: FoundationDefinitionDraft,
	identity: FoundationIdentityDraft
): FoundationDefinitionDraft {
	// Legacy identity rows may carry these fields; new rows deliberately
	// omit them. Normalize once so migration remains safe across both shapes.
	const legacy = {
		mainProblem: identity.mainProblem ?? '',
		painPoints: identity.painPoints ?? [],
		expectedOutcome: identity.expectedOutcome ?? '',
		kpis: identity.kpis ?? [],
		successCriteria: identity.successCriteria ?? [],
		failureCriteria: identity.failureCriteria ?? [],
		marketType: identity.marketType ?? definition.market.marketType,
		customerSize: identity.customerSize ?? [],
		industrySectors: identity.industrySectors ?? [],
		languages: identity.languages ?? [],
		regulations: identity.regulations ?? [],
		competitors: identity.competitors ?? [],
		differentiators: identity.differentiators ?? [],
		claimedCategory: identity.claimedCategory ?? ''
	};
	const o = definition.businessObjective;
	const businessObjectivePristine =
		o.mainProblem.trim().length === 0 &&
		o.painPoints.length === 0 &&
		o.expectedOutcome.trim().length === 0 &&
		o.kpis.length === 0 &&
		o.successCriteria.length === 0 &&
		o.failureCriteria.length === 0;

	const m = definition.market;
	const marketPristine =
		m.customerSize.length === 0 &&
		m.industrySectors.length === 0 &&
		m.languages.length === 0 &&
		m.regulations.length === 0;

	const c = definition.competition;
	const competitionPristine =
		c.directCompetitors.length === 0 &&
		c.differentiators.length === 0 &&
		c.claimedCategory.trim().length === 0;

	return {
		...definition,
		businessObjective: businessObjectivePristine
			? {
					...o,
					mainProblem: legacy.mainProblem,
					painPointLinks: legacy.painPoints.map((t) => createPainPointLink(t)),
					painPoints: [...legacy.painPoints],
					expectedOutcome: legacy.expectedOutcome,
					kpis: legacy.kpis.map((k) => ({ ...k })),
					successCriteria: [...legacy.successCriteria],
					failureCriteria: [...legacy.failureCriteria]
				}
			: o,
		market: marketPristine
			? {
					...m,
					marketType: legacy.marketType,
					customerSize: [...legacy.customerSize],
					industrySectors: [...legacy.industrySectors],
					languages: [...legacy.languages],
					regulations: [...legacy.regulations]
				}
			: m,
		competition: competitionPristine
			? {
					...c,
					directCompetitors: legacy.competitors.map(normalizeCompetitor),
					differentiators: [...legacy.differentiators],
					claimedCategory: legacy.claimedCategory
				}
			: c
	};
}
