import { getContext, setContext } from 'svelte';
import type { SpecLanguage } from '$domain/language';

/**
 * Project-wide provider for the language the spec is written in. The project
 * layout sets a live accessor (reading the layout's `data`, so a language
 * declared elsewhere shows at once); any component that writes generated text
 * (requirement sentences, proofs, what a change does to them) reads it.
 * English outside a project shell.
 */
const KEY = Symbol('spec-language');

export type SpecLanguageAccessor = () => SpecLanguage;

export function setSpecLanguage(accessor: SpecLanguageAccessor): void {
	setContext(KEY, accessor);
}

export function getSpecLanguage(): SpecLanguageAccessor {
	return getContext<SpecLanguageAccessor>(KEY) ?? (() => 'en');
}

/**
 * The same accessor for code that may run outside a component's setup (a
 * store built by a page, or by a test): English there, never an error.
 */
export function specLanguageAccessor(): SpecLanguageAccessor {
	try {
		return getSpecLanguage();
	} catch {
		return () => 'en';
	}
}
