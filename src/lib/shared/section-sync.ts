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

const PAGE_SCOPED_SECTIONS: ReadonlySet<string> = new Set([
	FEATURE_ADVICE_SECTION,
	IMPLEMENTATION_COVERAGE_SECTION
]);

/** True for a synthetic section that only its own page depends on. */
export function isPageScopedSection(section: string): boolean {
	return PAGE_SCOPED_SECTIONS.has(section);
}
