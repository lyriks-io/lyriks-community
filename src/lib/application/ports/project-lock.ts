/**
 * A real per-project mutex — held for the whole critical section — as opposed to
 * `DraftLockPort`, which is an optimistic revision counter (conflict detected only
 * after the fact). Reconciliation needs exclusion across its whole stage → promote
 * → quarantine sequence, so it uses this. The lock is cross-process (an FS lock in
 * the shared `data/unspa` volume) so a concurrent MCP/dashboard writer is excluded
 * too, not just another request in this process.
 */
export interface ProjectLockPort {
	/** Run `fn` while holding the project's exclusive lock; always releases it. */
	withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T>;
}
