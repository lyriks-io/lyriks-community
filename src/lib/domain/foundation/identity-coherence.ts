import type { CoherenceIssue, CoherenceResult } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { sectionTone } from '$domain/coherence/section-tone';
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
	/** The same message in French. */
	readonly fr: string;
	readonly penalty: number;
	triggered(draft: FoundationIdentityDraft): boolean;
}

const CONSISTENCY_RULES: ConsistencyRule[] = [
	{
		code: 'brief-without-formfactor',
		message: 'A brief is written but no form factor is chosen yet.',
		fr: "Un résumé est rédigé mais aucun format d'appareil n'est encore choisi.",
		penalty: 5,
		triggered: (d) => d.brief.trim().length >= 40 && d.formFactors.length === 0
	},
	{
		code: 'default-format-not-activated',
		message: 'The default structured rule format is not in the activated workspace patterns.',
		fr: "Le format de règle structuré par défaut ne fait pas partie des modèles activés de l'espace de travail.",
		penalty: 4,
		triggered: (d) => !d.activatedPatterns.includes(d.structuredRuleFormat)
	},
	{
		code: 'family-default-not-activated',
		message: 'A rule-family default points at a pattern that is not activated for this project.',
		fr: "Le défaut d'une famille de règles pointe vers un modèle qui n'est pas activé pour ce projet.",
		penalty: 4,
		triggered: (d) =>
			Object.values(d.ruleFamilyDefaults).some((p) => !d.activatedPatterns.includes(p))
	},
	{
		code: 'no-activated-pattern',
		message: 'No rule pattern is activated, so the rules would have no structured form to offer.',
		fr: "Aucun modèle de règle n'est activé, donc les règles n'auraient aucune forme structurée à proposer.",
		penalty: 5,
		triggered: (d) => d.activatedPatterns.length === 0
	}
];

export function computeIdentityCoherence(
	draft: FoundationIdentityDraft,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	const base = completeness(draft);
	const issues: CoherenceIssue[] = [];
	let penalty = 0;
	for (const rule of CONSISTENCY_RULES) {
		if (rule.triggered(draft)) {
			penalty += rule.penalty;
			issues.push({ code: rule.code, message: lang === 'fr' ? rule.fr : rule.message });
		}
	}
	const score = Math.max(0, Math.min(100, Math.round(base - penalty)));
	const { tone, label } = sectionTone(score, lang);
	return { score, tone, label, issues };
}
