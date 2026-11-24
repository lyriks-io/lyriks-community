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

/**
 * A baseline as the team server's copy of the project holds it: everything but
 * its requirements document (criterion 9a845c19). The document stays in Lyriks,
 * where Export reads it; nothing the copy serves needs it, and fifteen of them
 * (700 KB each on a project of 110 features) took the copy past what the team
 * server accepts.
 */
export type BaselineMarker = Omit<Baseline, 'content'>;

/** The baselines of a project without their requirements documents. */
export function baselinesWithoutDocuments(
	draft: ProjectBaselinesDraft
): Omit<ProjectBaselinesDraft, 'baselines'> & { baselines: BaselineMarker[] } {
	return { ...draft, baselines: (draft.baselines ?? []).map(({ content: _document, ...marker }) => marker) };
}

export function createEmptyBaselinesDraft(projectId: string): ProjectBaselinesDraft {
	return { projectId, baselines: [], lastSavedAt: null };
}
