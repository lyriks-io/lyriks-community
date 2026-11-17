import {
	ALL_FORM_FACTORS,
	INDUSTRIES,
	MARKET_TYPES,
	PRODUCT_TYPES,
	type FormFactorCode,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft
} from '$domain/foundation';

/**
 * What kind of product it is, the chips under the product's summary on At a
 * glance: its market (B2B...), its industry, its product type and the form
 * factors it is used through. They are choices from the platform's catalogues,
 * the market held by the definition, the rest by the identity. Pure.
 */
export interface ProductClassification {
	readonly marketType: string | null;
	readonly industry: string | null;
	readonly productType: string | null;
	readonly formFactors: readonly string[];
}

/** The classification as the spec holds it; a part never saved reads as not chosen. */
export function classificationOf(identity: FoundationIdentityDraft, definition: FoundationDefinitionDraft): ProductClassification {
	const named = identity.lastSavedAt !== null;
	// A definition never saved holds the form's defaults (B2B...), not an answer.
	const answered = definition.lastSavedAt !== null;
	return {
		marketType: answered && definition.market.marketType ? definition.market.marketType : null,
		industry: named && identity.industry ? identity.industry : null,
		productType: named && identity.productType ? identity.productType : null,
		formFactors: [...identity.formFactors]
	};
}

const MARKETS = new Set<string>(MARKET_TYPES.map((m) => m.code));
const PRODUCTS = new Set<string>(PRODUCT_TYPES.map((p) => p.code));
const FACTORS = new Set<string>(ALL_FORM_FACTORS.map((f) => f.code));
const KNOWN_INDUSTRIES = new Set<string>(INDUSTRIES.map((i) => i.code));

/** Why a classification cannot be kept, or null when every choice is one the catalogues offer. */
export function classificationProblem(c: ProductClassification): string | null {
	if (c.marketType !== null && !MARKETS.has(c.marketType)) return `"${c.marketType}" is not a market the platform knows.`;
	if (c.productType !== null && !PRODUCTS.has(c.productType)) return `"${c.productType}" is not a product type the platform knows.`;
	// An industry may be typed by the team: any short text is kept, a known code as such.
	if (c.industry !== null && !KNOWN_INDUSTRIES.has(c.industry) && (c.industry.trim() === '' || c.industry.length > 80)) return 'An industry is a short name.';
	const unknown = c.formFactors.find((f) => !FACTORS.has(f));
	return unknown ? `"${unknown}" is not a form factor the platform knows.` : null;
}

/** The identity and the definition with the classification written in; a choice left empty keeps what was there. */
export function withClassification(
	identity: FoundationIdentityDraft,
	definition: FoundationDefinitionDraft,
	c: ProductClassification
): { identity: FoundationIdentityDraft; definition: FoundationDefinitionDraft } {
	return {
		identity: {
			...identity,
			industry: c.industry?.trim() || identity.industry,
			productType: c.productType ?? identity.productType,
			formFactors: [...new Set(c.formFactors)] as FormFactorCode[]
		},
		definition: c.marketType ? { ...definition, market: { ...definition.market, marketType: c.marketType } } : definition
	};
}
