import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { EU_LANGUAGE_CODES } from './identity-enums';
import type { FoundationDefinitionDraft } from './definition';

/**
 * Local-coherence scoring for the definition slice (0–100), implementing the spec's
 * `Compute Local Coherence` action on feature `6b9ffe58`.
 *
 *   1. Completeness — the product definition, without treating optional
 *      enterprise controls as mandatory for every prototype.
 *   2. Consistency — cross-tab agreement penalties (e.g. PCI certification
 *      requires encryption-at-rest, retention rules require audit logs).
 *
 * Invariants: result clamped to [0, 100], matching the surface invariants
 * defined on the definition screen of feature `6b9ffe58`.
 */

interface Weighted {
	readonly weight: number;
	readonly met: boolean;
}

/** Fold a regulation label to a comparable key so `gdpr`, `GDPR` and `G.D.P.R`
 *  all match the canonical code — authors type these free-form. */
const regKey = (s: string): string => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Case/format-insensitive membership test over the market's declared regulations. */
function hasRegulation(draft: FoundationDefinitionDraft, code: string): boolean {
	const want = regKey(code);
	return draft.market.regulations.some((r) => regKey(r) === want);
}

function completeness(draft: FoundationDefinitionDraft): number {
	const items: Weighted[] = [
		/* Business objective */
		{ weight: 20, met: draft.businessObjective.mainProblem.trim().length > 0 },
		{ weight: 20, met: draft.businessObjective.expectedOutcome.trim().length > 0 },
		{ weight: 15, met: draft.businessObjective.successCriteria.length > 0 },
		{ weight: 10, met: draft.businessObjective.kpis.length > 0 },
		/* Market and position. `marketType` always carries a default value, so it is
		   never evidence that a market was actually described — only authored lists
		   count, otherwise an untouched draft would score itself. */
		{
			weight: 10,
			met:
				draft.market.customerSize.length > 0 ||
				draft.market.industrySectors.length > 0 ||
				draft.market.languages.length > 0 ||
				draft.market.regulations.length > 0
		},
		{
			weight: 10,
			met:
				draft.competition.differentiators.length > 0 ||
				draft.competition.positioning.trim().length > 0 ||
				draft.competition.claimedCategory.trim().length > 0
		},
		/* At least one explicit delivery boundary; individual controls stay optional. */
		{
			weight: 15,
			met:
				draft.business.contractualConstraints.length > 0 ||
				draft.business.risks.length > 0 ||
				draft.business.slas.length > 0 ||
				draft.technical.compatibilities.length > 0 ||
				draft.technical.integrations.length > 0 ||
				draft.technical.performance.length > 0 ||
				draft.technical.availability.trim().length > 0 ||
				draft.security.authentication.length > 0 ||
				draft.security.encryption.length > 0 ||
				draft.security.dataRetention.length > 0
		}
	];
	const total = items.reduce((s, i) => s + i.weight, 0);
	const earned = items.reduce((s, i) => s + (i.met ? i.weight : 0), 0);
	return (earned / total) * 100;
}

interface ConsistencyRule {
	readonly code: string;
	readonly message: string;
	readonly penalty: number;
	triggered(draft: FoundationDefinitionDraft): boolean;
}

const CONSISTENCY_RULES: ConsistencyRule[] = [
	{
		code: 'auth-no-encryption',
		message: 'Authentication is declared but no encryption (at-rest or in-transit) is selected.',
		penalty: 8,
		triggered: (d) =>
			d.security.authentication.length > 0 && d.security.encryption.length === 0
	},
	{
		code: 'sla-no-availability',
		message: 'SLAs are committed but no required availability target is set.',
		penalty: 6,
		triggered: (d) => d.business.slas.length > 0 && d.technical.availability.trim().length === 0
	},
	{
		code: 'retention-no-audit',
		message: 'Data retention rules exist but audit logs are off: no trail for deletions.',
		penalty: 6,
		triggered: (d) => d.security.dataRetention.length > 0 && d.security.auditLogs === 'none'
	},
	{
		code: 'pci-needs-at-rest',
		message: 'PCI DSS certification expected but encryption-at-rest is not declared.',
		penalty: 5,
		triggered: (d) =>
			d.security.expectedCertifications.includes('PCI_DSS') &&
			!d.security.encryption.includes('at_rest')
	},
	{
		code: 'eu-lang-no-gdpr',
		message: 'EU languages are targeted but GDPR is not listed in the market regulations.',
		penalty: 6,
		triggered: (d) =>
			d.market.languages.some((l) => EU_LANGUAGE_CODES.includes(l)) &&
			!hasRegulation(d, 'GDPR')
	},
	{
		code: 'competitors-no-differentiator',
		message: 'Direct competitors are listed but no differentiator sets the product apart.',
		penalty: 5,
		triggered: (d) =>
			d.competition.directCompetitors.length > 0 && d.competition.differentiators.length === 0
	},
	{
		code: 'outcome-no-kpi',
		message: 'An expected outcome is stated but no target KPI makes it measurable.',
		penalty: 4,
		triggered: (d) =>
			d.businessObjective.expectedOutcome.trim().length > 0 &&
			d.businessObjective.kpis.length === 0
	}
];

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeDefinitionCoherence(draft: FoundationDefinitionDraft): CoherenceResult {
	const base = completeness(draft);
	const issues: CoherenceIssue[] = [];
	let penalty = 0;
	for (const rule of CONSISTENCY_RULES) {
		if (rule.triggered(draft)) {
			penalty += rule.penalty;
			issues.push({ code: rule.code, message: rule.message });
		}
	}
	const score = Math.max(0, Math.min(100, Math.round(base - penalty)));
	const { tone, label } = toneFor(score);
	return { score, tone, label, issues };
}
