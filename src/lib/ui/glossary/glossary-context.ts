import { getContext, setContext } from 'svelte';
import type { GlossaryTerm } from '$domain/glossary';

/**
 * Project-wide provider for the governed vocabulary. The project layout sets a
 * live accessor (reading the layout's `data`, so it refreshes with live-sync);
 * any `GlossaryText` deeper in the tree reads it to mark governed words with a
 * hover definition. Defaults to an empty vocabulary outside a project shell.
 */
const KEY = Symbol('glossary-terms');

export type GlossaryTermsAccessor = () => GlossaryTerm[];

export function setGlossaryTerms(accessor: GlossaryTermsAccessor): void {
	setContext(KEY, accessor);
}

export function getGlossaryTerms(): GlossaryTermsAccessor {
	return getContext<GlossaryTermsAccessor>(KEY) ?? (() => []);
}
