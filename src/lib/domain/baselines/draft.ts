/**
 * A named specification baseline: an immutable snapshot of the spec at a point
 * in time. Captures the headline scores + counts for quick comparison, and the
 * human-readable requirements document (Markdown) so the baseline is a durable,
 * exportable record. Capture happens server-side (it reads the whole envelope);
 * name/note are editable, the snapshot fields are not.
 */
export interface Baseline {
	readonly id: string;
	name: string;
	note: string;
	readonly createdAt: string;
	readonly readiness: number;
	readonly coherence: number;
	readonly featureCount: number;
	readonly content: string;
}

export interface ProjectBaselinesDraft {
	projectId: string;
	baselines: Baseline[];
	lastSavedAt: string | null;
}

export function createEmptyBaselinesDraft(projectId: string): ProjectBaselinesDraft {
	return { projectId, baselines: [], lastSavedAt: null };
}
