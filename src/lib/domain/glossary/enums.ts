/**
 * Closed vocabularies for the Glossary capability. Source of truth:
 * Unspaghettit feature `297051ca`. Codes are persisted; labels are the plain
 * display copy shown in the UI.
 */

import type { Option } from '$domain/shared';

/** Language a term is authored in — FR and EN coexist in one glossary. */
export const GLOSSARY_LOCALES = [
	{ code: 'fr', label: 'FR' },
	{ code: 'en', label: 'EN' }
] as const satisfies readonly Option[];
export type GlossaryLocale = (typeof GLOSSARY_LOCALES)[number]['code'];
export const isGlossaryLocale = (v: unknown): v is GlossaryLocale =>
	v === 'fr' || v === 'en';

/** Governance state of a term. Approved terms lock the project's language. */
export const GLOSSARY_STATUSES = [
	{ code: 'draft', label: 'Draft' },
	{ code: 'approved', label: 'Approved' }
] as const satisfies readonly Option[];
export type GlossaryStatus = (typeof GLOSSARY_STATUSES)[number]['code'];
export const isGlossaryStatus = (v: unknown): v is GlossaryStatus =>
	v === 'draft' || v === 'approved';
