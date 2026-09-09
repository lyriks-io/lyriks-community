/**
 * Pure reconciliation planner for the Unspaghettit kernel store.
 *
 * When one Lyriks project ends up with several `data/unspa/<key>` folders (a
 * slug/UUID twin, or copies left by aborted registrations), this decides how to
 * fold them into ONE canonical folder — WITHOUT any IO. It compares features by
 * their internal id, treats byte- or structurally-identical copies as the same
 * (order-insensitive), merges non-overlapping content, and STOPS on a genuine
 * conflict (same feature id, materially different content) for manual resolution.
 *
 * It never uses "latest timestamp wins": a conflict is surfaced, never guessed.
 * The output is a machine-readable plan; execution (staging, atomic promote,
 * quarantine, link update) is the use-case's job, and only runs when there are
 * no conflicts.
 */

export interface CandidateManifest {
	/** manifest `project.id` (normally equal to the folder name). */
	readonly projectId: string;
	readonly name: string;
	readonly featureIds: readonly string[];
}

export interface CandidateFeature {
	readonly id: string;
	/** full parsed feature object, used for structural comparison. */
	readonly content: unknown;
}

export interface CandidateFolder {
	readonly folderKey: string;
	readonly manifest: CandidateManifest | null;
	readonly features: readonly CandidateFeature[];
}

export type AutomaticAction =
	| { readonly kind: 'keep-feature'; readonly featureId: string; readonly folderKey: string }
	| { readonly kind: 'adopt-feature'; readonly featureId: string; readonly fromFolderKey: string }
	| { readonly kind: 'dedup-feature'; readonly featureId: string; readonly duplicateFolderKeys: string[] };

export interface FeatureConflict {
	readonly featureId: string;
	readonly versions: ReadonlyArray<{ readonly folderKey: string; readonly hash: string }>;
}

export interface QuarantineAction {
	readonly folderKey: string;
	readonly reason: string;
}

export interface ReconciliationPlan {
	readonly projectId: string;
	readonly canonicalKernelId: string;
	readonly sources: string[];
	readonly status: 'clean' | 'auto-resolvable' | 'conflicts';
	readonly automaticActions: AutomaticAction[];
	readonly conflicts: FeatureConflict[];
	readonly quarantineActions: QuarantineAction[];
	/** The manifest to write into the canonical folder (valid only when no conflicts). */
	readonly canonicalManifest: { projectId: string; name: string; featureIds: string[] };
	/** The features to write into the canonical folder (valid only when no conflicts). */
	readonly mergedFeatures: Array<{ id: string; content: unknown; fromFolderKey: string }>;
}

/** Deterministic, order-insensitive serialization for structural equality. */
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return `{${keys
		.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
		.join(',')}}`;
}

/** Small, stable, dependency-free content fingerprint (FNV-1a, hex). */
export function contentHash(value: unknown): string {
	const s = stableStringify(value);
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Build the reconciliation plan for one project.
 *
 * @param projectId          the immutable Lyriks project id (for reporting).
 * @param canonicalKernelId  the folder key the winner must live under: the
 *                           immutable Lyriks project id also registered in back
 *                           as `kernel_project_id`. Chosen by the caller from DB
 *                           truth — never inferred here.
 * @param candidates         every folder currently believed to belong to the project.
 */
export function planReconciliation(
	projectId: string,
	canonicalKernelId: string,
	candidates: readonly CandidateFolder[]
): ReconciliationPlan {
	const sources = candidates.map((c) => c.folderKey);
	const canonical = candidates.find((c) => c.folderKey === canonicalKernelId) ?? null;

	// Gather every feature id across all folders, with each distinct content.
	const byFeature = new Map<string, Array<{ folderKey: string; content: unknown; hash: string }>>();
	for (const folder of candidates) {
		for (const feat of folder.features) {
			if (!byFeature.has(feat.id)) byFeature.set(feat.id, []);
			byFeature.get(feat.id)!.push({ folderKey: folder.folderKey, content: feat.content, hash: contentHash(feat.content) });
		}
	}

	const automaticActions: AutomaticAction[] = [];
	const conflicts: FeatureConflict[] = [];
	const mergedFeatures: Array<{ id: string; content: unknown; fromFolderKey: string }> = [];

	for (const [featureId, versions] of [...byFeature.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		const distinct = new Map<string, { folderKey: string; content: unknown }>();
		for (const v of versions) if (!distinct.has(v.hash)) distinct.set(v.hash, { folderKey: v.folderKey, content: v.content });

		if (distinct.size > 1) {
			// Same id, materially different content → never auto-pick.
			conflicts.push({
				featureId,
				versions: [...distinct.entries()].map(([hash, v]) => ({ folderKey: v.folderKey, hash }))
			});
			continue;
		}

		// One agreed content. Prefer the canonical folder's own copy as the source.
		const canonicalHasIt = versions.some((v) => v.folderKey === canonicalKernelId);
		const source = versions.find((v) => v.folderKey === canonicalKernelId) ?? versions[0];
		mergedFeatures.push({ id: featureId, content: source.content, fromFolderKey: source.folderKey });

		if (canonicalHasIt) automaticActions.push({ kind: 'keep-feature', featureId, folderKey: canonicalKernelId });
		else automaticActions.push({ kind: 'adopt-feature', featureId, fromFolderKey: source.folderKey });

		const duplicateFolderKeys = versions.map((v) => v.folderKey).filter((k) => k !== source.folderKey);
		if (duplicateFolderKeys.length > 0) automaticActions.push({ kind: 'dedup-feature', featureId, duplicateFolderKeys });
	}

	const status: ReconciliationPlan['status'] =
		conflicts.length > 0 ? 'conflicts' : automaticActions.some((a) => a.kind !== 'keep-feature') || sources.length > 1 ? 'auto-resolvable' : 'clean';

	// Losing folders (everything that is not the canonical key) are quarantined —
	// but only when the plan is executable (no conflicts). Reported regardless.
	const quarantineActions: QuarantineAction[] = sources
		.filter((k) => k !== canonicalKernelId)
		.map((folderKey) => ({ folderKey, reason: `reconciled into ${canonicalKernelId}` }));

	const name = canonical?.manifest?.name ?? candidates.find((c) => c.manifest)?.manifest?.name ?? projectId;

	return {
		projectId,
		canonicalKernelId,
		sources,
		status,
		automaticActions,
		conflicts,
		quarantineActions,
		canonicalManifest: {
			// The on-disk manifest id must equal the folder name (the canonical key).
			projectId: canonicalKernelId,
			name,
			featureIds: mergedFeatures.map((f) => f.id).sort()
		},
		mergedFeatures
	};
}
