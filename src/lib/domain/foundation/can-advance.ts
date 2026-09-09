import type { FoundationDefinitionDraft } from './definition';
import type { FoundationIdentityDraft } from './identity';

/**
 * The minimum bar that unlocks the next wizard step, verbatim from the spec's
 * `init.canAdvance` definition and the Go-To-Next-Step rule:
 *   productName + brief + ≥1 form factor. Business outcomes are owned and
 *   gated by the definition slice, so identity never blocks on its retired copy.
 */
export interface AdvanceRequirement {
	readonly key: string;
	readonly label: string;
	readonly met: boolean;
}

export function advanceRequirements(draft: FoundationIdentityDraft): AdvanceRequirement[] {
	return [
		{ key: 'productName', label: 'Product name', met: draft.productName.trim().length > 0 },
		{ key: 'brief', label: 'Brief', met: draft.brief.trim().length > 0 },
		{ key: 'formFactors', label: 'At least one form factor', met: draft.formFactors.length > 0 }
	];
}

export function identityCanAdvance(draft: FoundationIdentityDraft): boolean {
	return advanceRequirements(draft).every((r) => r.met);
}

/** Labels of the still-missing requirements (drives the Next-step tooltip). */
export function missingIdentityRequirements(draft: FoundationIdentityDraft): string[] {
	return advanceRequirements(draft)
		.filter((r) => !r.met)
		.map((r) => r.label);
}

/**
 * Minimum bar to unlock Step 03 (Users & Permissions). Mirrors the feature
 * invariant on `6b9ffe58`: the core problem is stated and the product-level
 * constraints are locked — one authentication mechanism and a declared
 * availability target. (The stack is an Architecture concern, not definition.)
 */
export function definitionCanAdvance(draft: FoundationDefinitionDraft): boolean {
	return missingDefinitionRequirements(draft).length === 0;
}

export function missingDefinitionRequirements(draft: FoundationDefinitionDraft): string[] {
	const missing: string[] = [];
	if (draft.businessObjective.mainProblem.trim().length === 0) missing.push('the main problem');
	if (draft.security.authentication.length === 0) missing.push('one authentication mechanism');
	if (draft.technical.availability.trim().length === 0) missing.push('an availability target');
	return missing;
}
