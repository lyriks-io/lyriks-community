import {
	ALL_FORM_FACTORS,
	AUTHORIZATION_MODELS,
	AUTH_MECHANISMS,
	CERTIFICATIONS,
	ENCRYPTION_SCOPES,
	LANGUAGES,
	MARKET_TYPES,
	PRODUCT_TYPES,
	REGULATIONS,
	industryLabelOf
} from '$domain/foundation';
import type { Option } from '$domain/shared';
import { labelOf } from './labels';

/**
 * How the Specification 360 pages name the choices they show, by the place a
 * value sits at: the same option lists At a glance and Requirements read
 * (glance.ts, classification.ts, tech.ts), so a change to one of those values
 * reads, on a request, in the words its page shows it (ac-evo-draft-section-read).
 */
const OPTIONS_BY_PATH: Readonly<Record<string, readonly Option[]>> = {
	'identity.productType': PRODUCT_TYPES,
	'identity.formFactors': ALL_FORM_FACTORS,
	'definition.market.marketType': MARKET_TYPES,
	'definition.market.languages': LANGUAGES,
	'definition.market.regulations': REGULATIONS,
	'definition.security.authentication': AUTH_MECHANISMS,
	'definition.security.authorization': AUTHORIZATION_MODELS,
	'definition.security.encryption': ENCRYPTION_SCOPES,
	'definition.security.expectedCertifications': CERTIFICATIONS
};

/** The words a page shows for a value at `path`: the label of a choice, the value itself anywhere else. */
export function pageValueLabel(place: { readonly path: string }, value: string): string {
	if (place.path === 'identity.industry') return industryLabelOf(value);
	const options = OPTIONS_BY_PATH[place.path];
	return options ? labelOf(options, value) : value;
}
