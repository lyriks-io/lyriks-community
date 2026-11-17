/**
 * Storage port for the reconciliation engine. Reads candidate kernel folders by
 * their internal content (never by filename), and — only when the use-case has a
 * conflict-free plan — atomically promotes the merged canonical folder and moves
 * losing folders into a recoverable quarantine. Never deletes.
 */

import type { KernelArtifact } from '$domain/portability';

/** One on-disk `data/unspa/<folderKey>` folder, parsed by content id. */
export interface LoadedFolder {
	readonly folderKey: string;
	/** The raw inner `project` object from the `*.project.json` manifest, or null. */
	readonly project: Record<string, unknown> | null;
	/**
	 * The raw inner `feature` objects from every `*.feature.json`, keyed by id.
	 *
	 * One id can appear twice: the engine names files by slug and renames on
	 * rename, so a folder can hold both `<id>.feature.json` and a slug-named file
	 * carrying the same id. The reader therefore also gets `fileName`, which is
	 * what decides which of two twins a copy must carry (see
	 * `chooseKernelFeatures`).
	 */
	readonly features: ReadonlyArray<{
		readonly id: string;
		readonly feature: Record<string, unknown>;
		/** Basename inside the folder, e.g. `feat-login.feature.json`. */
		readonly fileName: string;
	}>;
	/** Read on export only; ordinary reconciliation reads do not load source text. */
	readonly artifacts?: readonly KernelArtifact[];
}

export interface PromoteCanonicalInput {
	readonly canonicalKernelId: string;
	/** The merged inner `project` object (its `id` must equal `canonicalKernelId`). */
	readonly project: Record<string, unknown>;
	/** The merged inner `feature` objects to write into the canonical folder. */
	readonly features: ReadonlyArray<Record<string, unknown>>;
	/** Shared timestamp so a pre-reconcile backup lands in the same quarantine batch. */
	readonly quarantineStamp: string;
	/** Explicit on import, including [] for a legacy archive; omitted by reconciliation. */
	readonly artifacts?: readonly KernelArtifact[];
}

export interface ReconciliationStorePort {
	/** Read the given folders, parsing manifest + features by content id. */
	loadCandidates(folderKeys: readonly string[], options?: { readonly includeArtifacts?: boolean }): Promise<LoadedFolder[]>;
	/**
	 * Stage the canonical folder in a temp dir and atomically swap it into place,
	 * backing up any existing canonical folder into the quarantine first.
	 */
	promoteCanonical(input: PromoteCanonicalInput): Promise<void>;
	/** Move a losing folder into `data/unspa/.quarantine/<stamp>/`; returns its new path (null if absent). */
	quarantine(folderKey: string, stamp: string): Promise<string | null>;
}
