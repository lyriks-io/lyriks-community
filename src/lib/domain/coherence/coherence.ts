import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import type { SpecLanguage } from '$domain/language';
import { blockingGapCount, isGreen, type CoherenceAnalysis, type ProjectCoherenceDraft } from './draft';

/**
 * This step's OWN local-coherence chip (the bottom bar) — distinct from the
 * aggregate readiness ring. It reflects how close Step 09 itself is to "done":
 *   - readiness contributes the bulk (scaled),
 *   - open blocking gaps hold it back,
 *   - generating the specs on a green spec tops it out.
 */
function toneFor(score: number, lang: SpecLanguage): { tone: CoherenceTone; label: string } {
	const fr = lang === 'fr';
	if (score < 34) return { tone: 'critical', label: fr ? 'Critique' : 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: fr ? 'À surveiller' : 'Watch' };
	return { tone: 'strong', label: fr ? 'Solide' : 'Strong' };
}

export function computeCoherenceLocal(
	draft: ProjectCoherenceDraft,
	analysis: CoherenceAnalysis,
	lang: SpecLanguage = 'en'
): CoherenceResult {
	const fr = lang === 'fr';
	const issues: CoherenceIssue[] = [];
	// 70 pts scaled from readiness, 30 pts for generated specs on a green spec.
	let score = Math.round(0.7 * Math.max(0, Math.min(100, analysis.readinessScore)));

	const blocking = blockingGapCount(analysis);
	if (blocking > 0) {
		issues.push({
			code: 'blocking-gap',
			message: fr
				? `${blocking} manque(s) bloquant(s) avant l'envoi.`
				: `${blocking} blocking gap(s) before push.`
		});
	}
	if (analysis.readinessScore < draft.threshold) {
		issues.push({
			code: 'below-threshold',
			message: fr
				? `La maturité ${analysis.readinessScore} est sous le seuil de ${draft.threshold}.`
				: `Readiness ${analysis.readinessScore} is below the ${draft.threshold} bar.`
		});
	}
	if (draft.specsGenerated && isGreen(draft, analysis)) {
		score += 30;
	} else {
		issues.push({
			code: 'no-specs',
			message: fr ? 'Les spécifications ne sont pas encore générées.' : 'Specifications not generated yet.'
		});
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped, lang);
	return { score: clamped, tone, label, issues };
}
