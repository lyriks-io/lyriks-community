import { architectureStage, type ProjectArchitectureDraft } from './draft';

/**
 * Minimum bar to unlock Step 09 (Global coherence): at least one tech choice
 * with an attached reference doc — the "every tech decision has an official
 * reference" promise. Mirrors the feature invariant on `8c799e4a`.
 */
export function architectureCanAdvance(draft: ProjectArchitectureDraft): boolean {
	return missingArchitectureRequirements(draft).length === 0;
}

export function missingArchitectureRequirements(draft: ProjectArchitectureDraft): string[] {
	if (architectureStage(draft) === 'logical') {
		return draft.techChoices.some((component) => component.name.trim() && component.role.trim())
			? [] : ['one named component with its responsibility'];
	}
	const missing: string[] = [];
	if (draft.techChoices.length === 0) {
		missing.push('one tech choice');
	} else if (!draft.techChoices.some((t) => t.referenceDocId)) {
		missing.push('a reference doc attached to one tech');
	}
	return missing;
}
