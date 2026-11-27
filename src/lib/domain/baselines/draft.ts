/**
 * A baseline of the specification: the moment Lyriks recorded one of its
 * milestones (the definitive validation, a code change kept, an evolution
 * closed, a Reverse-Specification published), under the milestone's name.
 * The version of the specification is counted from them (see spec-version);
 * nothing else is kept, and no page shows them (criterion 1eb35bd3).
 */
export interface Baseline {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
}

export interface ProjectBaselinesDraft {
	projectId: string;
	baselines: Baseline[];
	lastSavedAt: string | null;
}

export function createEmptyBaselinesDraft(projectId: string): ProjectBaselinesDraft {
	return { projectId, baselines: [], lastSavedAt: null };
}
