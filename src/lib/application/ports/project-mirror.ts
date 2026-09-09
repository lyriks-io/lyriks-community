import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

/**
 * Outbound port to a companion service that mirrors every project save. The
 * platform stays the local source of truth; the mirror is a best-effort
 * dual-write. The open-source build has no mirror at all (`enabled` false, every
 * call a no-op); the Enterprise overlay plugs lyriks-back in here.
 *
 * Implementations are responsible for session bootstrap, project idempotency
 * and swallowing transient errors without breaking the local save flow.
 */
export interface ProjectMirrorPort {
	/** False when there is nothing to mirror to: every method is then a no-op. */
	readonly enabled: boolean;

	/**
	 * Resolve (and remember) the mirror's project id for a local project slug,
	 * creating it there if needed. Returns `null` when the mirror is unreachable
	 * (caller logs + skips).
	 */
	ensureProject(localProjectId: string, displayName: string): Promise<string | null>;

	/**
	 * Replace the project's envelope JSON blob. `version` (when provided) rides
	 * along as the mirror's stale-write guard. `synced` = landed; `stale` = the
	 * mirror already holds a NEWER envelope (terminal, never retried); `failed` =
	 * transport error (retryable).
	 */
	pushEnvelope(
		mirrorProjectId: string,
		envelope: Record<string, unknown>,
		version?: number
	): Promise<'synced' | 'stale' | 'failed'>;

	/** Propagate the project's Unspaghettit snapshot through the mirror. Best-effort. */
	propagateProject(localProjectId: string, snapshot: UnspaProjectSnapshot): Promise<void>;

	/** Same as `propagateProject` for a single leaf feature shell. */
	propagateFeature(
		localProjectId: string,
		featureId: string,
		snapshot: UnspaFeatureSnapshot
	): Promise<void>;

	/**
	 * Delete the mirrored project and forget the local link. Best-effort: a
	 * disabled or unreachable mirror is a no-op so the local delete proceeds.
	 * Must run BEFORE the local link mapping is removed.
	 */
	deleteProject(localProjectId: string): Promise<void>;
}
