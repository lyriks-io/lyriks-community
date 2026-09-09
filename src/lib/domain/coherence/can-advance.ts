import {
	blockingGapCount,
	isGreen,
	type CoherenceAnalysis,
	type ProjectCoherenceDraft
} from './draft';

/** Spec generation is allowed only on a green, gap-free spec. */
export function canGenerateSpecs(
	draft: ProjectCoherenceDraft,
	analysis: CoherenceAnalysis
): boolean {
	return isGreen(draft, analysis);
}

/**
 * Minimum bar to unlock Step 10 (AI Generation Contract): the specs have been
 * generated on a green spec. Mirrors the feature invariant on `fde7bb20`
 * (canAdvance ⇒ specsGenerated) plus the runtime green check.
 */
export function coherenceCanAdvance(
	draft: ProjectCoherenceDraft,
	analysis: CoherenceAnalysis
): boolean {
	return missingCoherenceRequirements(draft, analysis).length === 0;
}

export function missingCoherenceRequirements(
	draft: ProjectCoherenceDraft,
	analysis: CoherenceAnalysis
): string[] {
	const missing: string[] = [];
	const blocking = blockingGapCount(analysis);
	if (analysis.readinessScore < draft.threshold) {
		missing.push(`reach readiness ${draft.threshold} (now ${analysis.readinessScore})`);
	}
	if (blocking > 0) missing.push(`resolve ${blocking} blocking gap${blocking === 1 ? '' : 's'}`);
	if (!draft.specsGenerated) missing.push('generate the specifications');
	return missing;
}
