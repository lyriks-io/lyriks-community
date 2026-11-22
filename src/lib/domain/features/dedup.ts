import type { ProjectFeaturesDraft } from './draft';

/**
 * Global feature-id preflight for imports/templates (MR 6).
 *
 * Feature ids must be unique within one project. When a project is instantiated
 * from a template (or two templates share a fixture), the same id can appear
 * twice, and because the id IS the on-disk kernel folder key, a collision
 * silently merges two different features. `detectDuplicateFeatureIds` finds them.
 */

/** Feature ids that appear more than once in the draft's leaf set. */
export function detectDuplicateFeatureIds(draft: Pick<ProjectFeaturesDraft, 'features'>): string[] {
	const seen = new Set<string>();
	const dupes = new Set<string>();
	for (const f of draft.features) {
		if (seen.has(f.id)) dupes.add(f.id);
		seen.add(f.id);
	}
	return [...dupes];
}
