import type { GlossaryLocale, GlossaryStatus } from './enums';

/* ── Entities — mirror of Unspaghettit feature 297051ca ─────────────── */

/**
 * One governed concept in the project vocabulary: a canonical word plus the
 * synonyms to accept, the synonyms to ban, a definition, an example and a
 * locale — so downstream generation always uses one agreed word per concept.
 */
export interface GlossaryTerm {
	readonly id: string;
	term: string;
	definition: string;
	synonymsAllowed: string[];
	synonymsAvoid: string[];
	example: string;
	locale: GlossaryLocale;
	status: GlossaryStatus;
	/** Ids from the project Documents & Sources register that define this term. */
	sourceIds: string[];
}

/** A candidate term mined from the brief that is not governed yet. Never persisted. */
export interface GlossarySuggestion {
	term: string;
	weight: number;
}

/**
 * The persisted content of the Glossary capability. `terms` is the whole
 * authored vocabulary; the health score and suggestions are derived on the
 * client from the terms plus the upstream corpus and are never stored.
 */
export interface ProjectGlossaryDraft {
	projectId: string;
	terms: GlossaryTerm[];
	lastSavedAt: string | null;
}

export function createEmptyGlossaryDraft(projectId: string): ProjectGlossaryDraft {
	return {
		projectId,
		terms: [],
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createTerm(overrides: Partial<GlossaryTerm> = {}): GlossaryTerm {
	return {
		id: newId(),
		term: '',
		definition: '',
		synonymsAllowed: [],
		synonymsAvoid: [],
		example: '',
		locale: 'en',
		status: 'draft',
		sourceIds: [],
		...overrides
	};
}
