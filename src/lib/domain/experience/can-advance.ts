import { stepsOfJourney, type ProjectExperienceDraft } from './draft';

/**
 * Minimum bar to unlock Step 06 (Rules & edge cases): at least one Journey
 * that carries at least one Step. Mirrors the feature invariant on `1bf10f8f`
 * ("canAdvance ⇒ journeys non-empty, and each unlocking journey has ≥ 1 step").
 */
export function experienceCanAdvance(draft: ProjectExperienceDraft): boolean {
	return missingExperienceRequirements(draft).length === 0;
}

export function missingExperienceRequirements(draft: ProjectExperienceDraft): string[] {
	if (draft.journeys.length === 0) return ['one Journey'];
	const anyWithStep = draft.journeys.some((j) => stepsOfJourney(draft, j.id).length > 0);
	if (!anyWithStep) return ['at least one Step inside a Journey'];
	return [];
}
