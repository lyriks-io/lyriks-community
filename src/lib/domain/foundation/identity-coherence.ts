import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { FoundationIdentityDraft } from './identity';

/**
 * Local-coherence scoring for the identity slice (0–100), the real
 * implementation behind the spec's `Compute Local Coherence`. Two parts:
 *   1. Completeness — identity, brief and intended form factors.
 *   2. Consistency — the identity-owned authoring-method settings.
 *
 * Business/market/competition completeness is scored exactly once by the
 * definition slice.
 * Invariants: result is always clamped to [0, 100].
 */

interface Weighted {
	readonly weight: number;
	readonly met: boolean;
}

function completeness(draft: FoundationIdentityDraft): number {
	const items: Weighted[] = [
		{ weight: 25, met: draft.productName.trim().length > 0 },
		{ weight: 50, met: draft.brief.trim().length >= 40 },
		{ weight: 25, met: draft.formFactors.length > 0 }
	];
	const total = items.reduce((s, i) => s + i.weight, 0);
	const earned = items.reduce((s, i) => s + (i.met ? i.weight : 0), 0);
	return (earned / total) * 100;
}

interface ConsistencyRule {
	readonly code: string;
	readonly message: string;
	readonly penalty: number;
	triggered(draft: FoundationIdentityDraft): boolean;
}

const CONSISTENCY_RULES: ConsistencyRule[] = [
	{
		code: 'brief-without-formfactor',
		message: 'A brief is written but no form factor is chosen yet.',
		penalty: 5,
		triggered: (d) => d.brief.trim().length >= 40 && d.formFactors.length === 0
	},
	{
		code: 'default-format-not-activated',
		message: 'The default structured rule format is not in the activated workspace patterns.',
		penalty: 4,
		triggered: (d) => !d.activatedPatterns.includes(d.structuredRuleFormat)
	},
	{
		code: 'family-default-not-activated',
		message: 'A rule-family default points at a pattern that is not activated for this project.',
		penalty: 4,
		triggered: (d) =>
			Object.values(d.ruleFamilyDefaults).some((p) => !d.activatedPatterns.includes(p))
	},
	{
		code: 'no-activated-pattern',
		message: 'No rule pattern is activated, so Rules & edge cases would have no structured form to offer.',
		penalty: 5,
		triggered: (d) => d.activatedPatterns.length === 0
	}
];

function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'At risk' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeIdentityCoherence(draft: FoundationIdentityDraft): CoherenceResult {
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
