import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

/**
 * Persistence boundary for the behavior model. Reads/writes Unspaghettit-format
 * snapshots so each Lyriks project is a valid Unspaghettit workspace. The
 * local-FS adapter is the on-prem default; Lyriks-back-over-HTTP plugs in here.
 */
export interface BehaviorRepositoryPort {
	loadProject(projectId: string): Promise<UnspaProjectSnapshot | null>;
	saveProject(snapshot: UnspaProjectSnapshot): Promise<void>;
	loadFeature(projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null>;
	saveFeature(projectId: string, snapshot: UnspaFeatureSnapshot): Promise<void>;
	/** Delete a project's entire Unspaghettit workspace folder (project + features). */
	deleteProject(projectId: string): Promise<void>;
	/** Absolute path of the workspace root — surface it in the UI so users can `cd` + `unspa dashboard`. */
	workspaceRoot(): string;
	/**
	 * Which OTHER projects store a kernel record under this feature id.
	 *
	 * Reads here are project-scoped (one folder per project), but the engine
	 * resolves a feature id across the whole workspace. The same id declared by
	 * two projects therefore means one record with two claimants: the engine
	 * writes to whichever copy it indexed, while the other project reads its own
	 * folder and sees nothing. Callers use this to refuse that write rather than
	 * perform it.
	 *
	 * Optional. An adapter that cannot enumerate the workspace (an HTTP-backed
	 * store) omits it, and the caller skips the check.
	 */
	projectsHoldingFeature?(projectId: string, featureId: string): Promise<readonly string[]>;
}
