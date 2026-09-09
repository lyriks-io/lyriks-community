/**
 * Optimistic locking for wizard-section saves. Each (project, section) carries a
 * monotonic revision. A client loads a section at revision N and must present N
 * when saving; if the stored revision moved on (someone else saved), the commit
 * is refused so we never silently overwrite a concurrent edit.
 */
export interface DraftLockPort {
	/** Current revision for a section (0 if never saved). */
	current(projectId: string, section: string): Promise<number>;

	/**
	 * Atomically bump the revision iff `expected` matches the stored one. Returns
	 * the new revision on success, or `null` on conflict. `expected === null`
	 * skips the check (first save / non-versioned caller) and always bumps.
	 */
	commit(projectId: string, section: string, expected: number | null): Promise<number | null>;

	/**
	 * Compensate a `commit` whose follow-up persistence failed: restore
	 * `committed - 1` iff the stored revision is still `committed`. Without this
	 * a failed save leaves the revision ahead of the document and the client's
	 * next save gets a false conflict. A no-op when another writer has already
	 * moved the revision on (their bump is legitimate).
	 */
	rollback(projectId: string, section: string, committed: number): Promise<void>;
}
