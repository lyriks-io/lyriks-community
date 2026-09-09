/**
 * Consolidated persistence for the "simple" wizard sections (no unspa/kernel
 * projection): one `project_section_documents` row per (project, section)
 * holding the document AND its optimistic-lock revision. Because both live in
 * the same row, a save is a single atomic compare-and-write — no separate lock
 * table, no compensation on failure — and the change event is published inside
 * the same transaction (Postgres bus) or right after commit (memory bus).
 */

/** A section change, as the sync bus broadcasts it (see sync-bus.server.ts). */
export interface SectionChangeEvent {
	readonly projectId: string;
	readonly section: string;
	/** clientId of the writer, for SSE echo suppression. Null for internal writers. */
	readonly origin: string | null;
}

/**
 * How the store emits a section change without depending on the bus module:
 * wired at the composition root from the sync bus.
 */
export interface SectionChangePublisher {
	/**
	 * Publish inside the open save transaction, using the caller's statement
	 * executor — a no-op when the bus is in-process (nothing to make atomic).
	 */
	publishInTx(
		exec: (text: string, values: unknown[]) => Promise<unknown>,
		change: SectionChangeEvent
	): Promise<void>;
	/** Publish after a successful commit — a no-op when the bus rides Postgres. */
	publishAfterCommit(change: SectionChangeEvent): void;
}

/** Raw section-keyed document store (documents are the stored JSON shapes). */
export interface SectionDocumentStorePort {
	/** The stored document, or null if the section was never saved. */
	load(projectId: string, section: string): Promise<unknown | null>;
	/**
	 * Atomic save: iff `expectedRevision` matches the stored one (null skips the
	 * check), write the document, bump the revision and publish the change — all
	 * in one transaction. Returns the new revision, or null on conflict.
	 */
	save(
		projectId: string,
		section: string,
		document: unknown,
		expectedRevision: number | null,
		origin: string | null
	): Promise<number | null>;
	/** Current revision for a section (0 if never saved). */
	currentRevision(projectId: string, section: string): Promise<number>;
}

/** Options a versioned caller (the autosave route) passes through to `save`. */
export interface SectionDraftSaveOptions {
	/** Revision the client loaded the draft at; null = unconditional save. */
	readonly expectedRevision: number | null;
	/** Writer clientId for SSE echo suppression. */
	readonly origin: string | null;
}

/**
 * A typed per-section view over the store — what the section save/load
 * use-cases depend on. `save` returns the new revision, or null on conflict.
 */
export interface SectionDraftRepositoryPort<T> {
	load(projectId: string): Promise<T | null>;
	save(draft: T, opts?: SectionDraftSaveOptions): Promise<number | null>;
	currentRevision(projectId: string): Promise<number>;
}
