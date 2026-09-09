/**
 * A reusable requirement template — a feature lifted out of one project so it
 * can be imported into another. Carries only the portable, Lyriks-owned facets
 * (name, rationale, acceptance criteria); the importing project mints a fresh
 * feature from it. `sourceProjectName` is display-only provenance.
 */
export interface RequirementTemplate {
	readonly id: string;
	title: string;
	description: string;
	problem: string;
	value: string;
	acceptanceCriteria: { id: string; text: string }[];
	sourceProjectName: string;
	readonly createdAt: string;
}

/**
 * The workspace-global reuse library. Stored in the residue table under a
 * reserved project key (see WORKSPACE_LIBRARY_ID), so every project in the
 * appliance shares one library without a new table. `projectId` is that reserved
 * key, kept only to satisfy the residue-draft shape.
 */
export interface ReuseLibraryDraft {
	projectId: string;
	templates: RequirementTemplate[];
	lastSavedAt: string | null;
}

/** Reserved residue key for the shared library (no real project uses it). */
export const WORKSPACE_LIBRARY_ID = '__workspace__';
export const REUSE_LIBRARY_SECTION = 'reuse-library';

export function createEmptyReuseLibrary(): ReuseLibraryDraft {
	return { projectId: WORKSPACE_LIBRARY_ID, templates: [], lastSavedAt: null };
}
