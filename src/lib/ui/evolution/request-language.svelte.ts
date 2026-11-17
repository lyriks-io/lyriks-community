import { getContext, setContext } from 'svelte';
import { requirementLanguage, type RequirementLanguage } from './requirement-kinds';

/**
 * The language of the spec a request page reads in, for the parts deep in it
 * that name the page's own words (a thread's suggestion names its places the
 * way the Solution tab does). Provided by the request page.
 */
const KEY = Symbol('evolution-request-language');

export function provideRequestLanguage(read: () => string | null | undefined): void {
	setContext(KEY, () => requirementLanguage(read()));
}

/** The request's language, English where no request page provides one. */
export function useRequestLanguage(): () => RequirementLanguage {
	return getContext<(() => RequirementLanguage) | undefined>(KEY) ?? (() => 'en');
}
