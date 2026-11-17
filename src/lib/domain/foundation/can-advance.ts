import type { FoundationDefinitionDraft } from './definition';
import type { FoundationIdentityDraft } from './identity';
import type { SpecLanguage } from '$domain/language';

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

export function advanceRequirements(
	draft: FoundationIdentityDraft,
	lang: SpecLanguage = 'en'
): AdvanceRequirement[] {
	const fr = lang === 'fr';
	return [
		{ key: 'productName', label: fr ? 'Nom du produit' : 'Product name', met: draft.productName.trim().length > 0 },
		{ key: 'brief', label: fr ? 'Résumé' : 'Brief', met: draft.brief.trim().length > 0 },
		{
			key: 'formFactors',
			label: fr ? "Au moins un format d'appareil" : 'At least one form factor',
			met: draft.formFactors.length > 0
		}
	];
}

export function identityCanAdvance(draft: FoundationIdentityDraft): boolean {
	return advanceRequirements(draft).every((r) => r.met);
}

/** Labels of the still-missing requirements (drives the Next-step tooltip). */
export function missingIdentityRequirements(
	draft: FoundationIdentityDraft,
	lang: SpecLanguage = 'en'
): string[] {
	return advanceRequirements(draft, lang)
		.filter((r) => !r.met)
		.map((r) => r.label);
}

/**
 * Minimum bar to unlock Step 03 (Users & Permissions). Mirrors the feature
 * invariant f134dca0: the core problem is stated and one authentication
 * mechanism is chosen. The availability target is no longer asked for (its
 * Performance entry is retired from the screen), so it no longer gates.
 * (The stack is an Architecture concern, not definition.)
 */
export function definitionCanAdvance(draft: FoundationDefinitionDraft): boolean {
	return missingDefinitionRequirements(draft).length === 0;
}

export function missingDefinitionRequirements(
	draft: FoundationDefinitionDraft,
	lang: SpecLanguage = 'en'
): string[] {
	const fr = lang === 'fr';
	const missing: string[] = [];
	if (draft.businessObjective.mainProblem.trim().length === 0)
		missing.push(fr ? 'le problème principal' : 'the main problem');
	if (draft.security.authentication.length === 0)
		missing.push(fr ? "un mécanisme d'authentification" : 'one authentication mechanism');
	// Retired (spec: criterion 5784d998): the availability is not asked for any more.
	// if (draft.technical.availability.trim().length === 0)
	// 	missing.push(fr ? 'un objectif de disponibilité' : 'an availability target');
	return missing;
}
