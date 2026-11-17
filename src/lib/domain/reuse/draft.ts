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
 * A workspace's reuse library. Stored in the residue table under a reserved
 * project key (see `libraryKeyFor`), one per workspace (issue 267), so a team
 * never reads another team's templates; an installation without workspaces
 * keeps one under WORKSPACE_LIBRARY_ID. `projectId` is that reserved key, kept
 * only to satisfy the residue-draft shape.
 */
export interface ReuseLibraryDraft {
	projectId: string;
	templates: RequirementTemplate[];
	lastSavedAt: string | null;
}

/** Reserved residue key for the library of an installation without workspaces (no real project uses it). */
export const WORKSPACE_LIBRARY_ID = '__workspace__';
export const REUSE_LIBRARY_SECTION = 'reuse-library';

/** The residue key of the library a workspace keeps; null is the installation without workspaces. */
export function libraryKeyFor(workspaceId: string | null): string {
	return workspaceId ? `${WORKSPACE_LIBRARY_ID}:${workspaceId}` : WORKSPACE_LIBRARY_ID;
}

export function createEmptyReuseLibrary(key: string = WORKSPACE_LIBRARY_ID): ReuseLibraryDraft {
	return { projectId: key, templates: [], lastSavedAt: null };
}
