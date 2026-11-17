/**
 * SvelteKit invalidation keys for the live-sync loop. A `load` declares what it
 * reads with `depends(...)`; the SSE client invalidates only the matching keys
 * when a section changes, so one section's autosave no longer re-runs every
 * page load in the project (`invalidateAll`).
 */

/**
 * Project-wide aggregate key. Declared by loads whose output is derived from
 * MANY sections (the project layout's coherence/readiness rings, the global
 * coherence page, search). Invalidated on every authored section change.
 */
export function projectSyncKey(projectId: string): string {
	return `lyriks:project:${projectId}`;
}

/**
 * One wizard section's key. Declared by loads that read that section's draft
 * or revision; invalidated when exactly that section is saved.
 */
export function sectionSyncKey(projectId: string, section: string): string {
	return `lyriks:project:${projectId}:section:${section}`;
}

/**
 * Synthetic sections the cached advisor tiers publish when a background
 * refresh lands: the per-leaf maturity advice and the code-implementation
 * coverage behind the Features tree's badges. Nothing authored changed when
 * one of these fires, and only the Features page reads them, so the client
 * invalidates their own key alone and never the project-wide one: filling a
 * badge must not re-run the coherence analysis in every open tab.
 */
export const FEATURE_ADVICE_SECTION = 'features-advice';
export const IMPLEMENTATION_COVERAGE_SECTION = 'features-implementation';

/**
 * Project health read anew behind a page (ac-score-shown-at-once): the open
 * pages read it in place. Never an input of a cached reading, so it cannot loop.
 */
export const PROJECT_HEALTH_SECTION = 'project-health';

/**
 * The Specification 360° discussions, kept in the section document store
 * under this internal key (never in the public SECTIONS list: it is not spec
 * the MCP authors). A post changes nothing in the spec, so only the readers of
 * the discussions re-run on it, never the project-wide aggregates.
 */
export const SPEC_DISCUSSIONS_SECTION = 'spec-discussions';

/**
 * The retrospecification's review (who validated what), under the domain's
 * internal `RETROSPEC_SECTION` key: a review click changes nothing authored, so
 * only the readers of the review re-run on it, never the project-wide analysis.
 */
export const RETROSPEC_REVIEW_SECTION = 'retrospec';

/**
 * What Lyriks detected in the AI's writes during a retrospecification (a
 * feature, a table, a role… by name), published when a detection lands: no
 * section changed with it, so only the Retrospecification page re-reads.
 */
export const RETROSPEC_DETECTED_SECTION = 'retrospec-detected';

/**
 * Where people put the tables of the data map by hand (criterion 7f5769bb),
 * kept apart from the specification: a move changes nothing the spec says, so
 * only the data maps re-read on it.
 */
export const DATA_MAP_PLACEMENTS_SECTION = 'data-map-placements';

/**
 * The private conversations of Ask my AI (surface cf20b92c), apart from the
 * specification and from every MCP section tool: only the Ask my AI page reads
 * them, and only each person's own.
 */
export const AI_CONVERSATIONS_SECTION = 'ai-conversations';

const PAGE_SCOPED_SECTIONS: ReadonlySet<string> = new Set([
	AI_CONVERSATIONS_SECTION,
	// A reading of the project health changes nothing authored: the pages that
	// show it depend on it, and a reading every 10 s while a proof runs must not
	// reload the project and Knowledge layouts (two to three megabytes) each time.
	PROJECT_HEALTH_SECTION,
	DATA_MAP_PLACEMENTS_SECTION,
	FEATURE_ADVICE_SECTION,
	IMPLEMENTATION_COVERAGE_SECTION,
	SPEC_DISCUSSIONS_SECTION,
	RETROSPEC_REVIEW_SECTION,
	RETROSPEC_DETECTED_SECTION
]);

/** True for a synthetic section that only its own page depends on. */
export function isPageScopedSection(section: string): boolean {
	return PAGE_SCOPED_SECTIONS.has(section);
}
