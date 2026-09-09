import type { CoherenceIssue, CoherenceResult, CoherenceTone } from '$domain/shared';
import { blockingGapCount, isGreen, type CoherenceAnalysis, type ProjectCoherenceDraft } from './draft';

/**
 * This step's OWN local-coherence chip (the bottom bar) — distinct from the
 * aggregate readiness ring. It reflects how close Step 09 itself is to "done":
 *   - readiness contributes the bulk (scaled),
 *   - open blocking gaps hold it back,
 *   - generating the specs on a green spec tops it out.
 */
function toneFor(score: number): { tone: CoherenceTone; label: string } {
	if (score < 34) return { tone: 'critical', label: 'Critical' };
	if (score < 67) return { tone: 'at-risk', label: 'Watch' };
	return { tone: 'strong', label: 'Strong' };
}

export function computeCoherenceLocal(
	draft: ProjectCoherenceDraft,
	analysis: CoherenceAnalysis
): CoherenceResult {
	const issues: CoherenceIssue[] = [];
	// 70 pts scaled from readiness, 30 pts for generated specs on a green spec.
	let score = Math.round(0.7 * Math.max(0, Math.min(100, analysis.readinessScore)));

	const blocking = blockingGapCount(analysis);
	if (blocking > 0) {
		issues.push({ code: 'blocking-gap', message: `${blocking} blocking gap(s) before push.` });
	}
	if (analysis.readinessScore < draft.threshold) {
		issues.push({
			code: 'below-threshold',
			message: `Readiness ${analysis.readinessScore} is below the ${draft.threshold} bar.`
		});
	}
	if (draft.specsGenerated && isGreen(draft, analysis)) {
		score += 30;
	} else {
		issues.push({ code: 'no-specs', message: 'Specifications not generated yet.' });
	}

	const clamped = Math.max(0, Math.min(100, Math.round(score)));
	const { tone, label } = toneFor(clamped);
	return { score: clamped, tone, label, issues };
}
