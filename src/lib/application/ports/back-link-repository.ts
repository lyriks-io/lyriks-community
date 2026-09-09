/**
 * Persists the local-projectId → back-projectId mapping so we don't have to
 * list /v1/projects on every wizard save to find the back's UUID. One row per
 * v3 project; the lookup is a primary-key hit.
 *
 * The link also carries registration health so the UI can show whether a project
 * is really mirrored to the back (`linked`), still being registered (`pending`),
 * or points at a back project that has since gone missing (`stale`) — the last
 * of which must be recovered explicitly, never silently re-created (that would
 * fork the project's identity). `local_only` is the derived state when no link
 * row exists at all (MAP / back disabled).
 */
export type BackLinkStatus = 'linked' | 'pending' | 'stale' | 'local_only';

export interface BackProjectLink {
	readonly localProjectId: string;
	readonly backProjectId: string;
	readonly backWorkspaceId: string;
	readonly status: BackLinkStatus;
	readonly lastError?: string;
}

/** The identity fields written when a link is created/confirmed (status → `linked`). */
export interface BackProjectLinkInput {
	readonly localProjectId: string;
	readonly backProjectId: string;
	readonly backWorkspaceId: string;
}

export interface BackLinkRepositoryPort {
	find(localProjectId: string): Promise<BackProjectLink | null>;
	/** Upsert the id mapping; marks the link `linked` and clears any prior error. */
	save(link: BackProjectLinkInput): Promise<void>;
	/** Record a health transition without touching the id mapping (no-op if absent). */
	markStatus(localProjectId: string, status: BackLinkStatus, lastError?: string): Promise<void>;
	/**
	 * Atomically bump and return the project's envelope mirror version (the
	 * back's stale-write guard). Bumped BEFORE the envelope is assembled, so a
	 * higher version always carries content read later — the ordering the back
	 * relies on to refuse an older envelope arriving after a newer one. Returns
	 * null when no link row exists yet (never registered / MAP mode).
	 */
	nextEnvelopeVersion(localProjectId: string): Promise<number | null>;
}
