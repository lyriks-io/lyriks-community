import type { ProjectExperienceDraft } from '$domain/experience';

/**
 * Non-fatal outcome of a save. `behaviorWarnings` carries the kernel merge-loss
 * warnings (engine-only structure this save dropped) so callers — the wizard UI
 * and the MCP — can tell the author instead of losing depth silently.
 */
export interface ExperienceSaveReport {
	behaviorWarnings: string[];
}

/** Outbound port for persisting Step 05 drafts. Parallel to Steps 01-04. */
export interface ExperienceDraftRepositoryPort {
	load(projectId: string): Promise<ProjectExperienceDraft | null>;
	/** Adapters without a kernel write path may resolve void (no warnings to report). */
	save(draft: ProjectExperienceDraft): Promise<ExperienceSaveReport | void>;
}
