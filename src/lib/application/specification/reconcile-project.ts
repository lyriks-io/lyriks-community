import type {
	BackLinkRepositoryPort,
	ClockPort,
	ProjectLockPort,
	ReconciliationStorePort
} from '$application/ports';
import {
	planReconciliation,
	type CandidateFolder,
	type ReconciliationPlan
} from '$application/reconciliation/reconciliation-plan';

export interface ReconcileProjectInput {
	/** The immutable Lyriks project id. */
	readonly projectId: string;
	/** The folder key the winner must live under: the immutable local project id. */
	readonly canonicalKernelId: string;
	/** Every folder believed to belong to the project (from the integrity auditor). */
	readonly sourceFolderKeys: readonly string[];
	/**
	 * When false (the default), only the plan is produced — nothing is written.
	 * Execution is opt-in and still refuses to run when the plan has conflicts.
	 */
	readonly apply?: boolean;
}

export interface ReconcileProjectResult extends ReconciliationPlan {
	readonly applied: boolean;
}

/**
 * Reconcile several kernel folders that belong to one Lyriks project into a single
 * canonical folder. Runs under an exclusive per-project lock; compares by internal
 * id; stops for manual resolution on any true conflict; and, only when asked to
 * apply a conflict-free plan, stages → atomically promotes the canonical folder,
 * quarantines the losers, and marks the back link healthy — in that order, so the
 * link is only touched after the filesystem succeeds. Never runs at startup and
 * never uses "latest timestamp wins".
 */
export class ReconcileProjectUseCase {
	constructor(
		private readonly store: ReconciliationStorePort,
		private readonly lock: ProjectLockPort,
		private readonly backLinks: BackLinkRepositoryPort,
		private readonly clock: ClockPort
	) {}

	async execute(input: ReconcileProjectInput): Promise<ReconcileProjectResult> {
		return this.lock.withLock(input.projectId, async () => {
			const loaded = await this.store.loadCandidates(input.sourceFolderKeys);
			const candidates: CandidateFolder[] = loaded.map((f) => ({
				folderKey: f.folderKey,
				manifest: f.project
					? {
							projectId: String(f.project.id ?? f.folderKey),
							name: String(f.project.name ?? f.folderKey),
							featureIds: Array.isArray(f.project.featureIds) ? (f.project.featureIds as string[]) : []
						}
					: null,
				features: f.features.map((x) => ({ id: x.id, content: x.feature }))
			}));

			const plan = planReconciliation(input.projectId, input.canonicalKernelId, candidates);

			// Only an explicitly-requested, conflict-free, non-trivial plan is executed.
			if (!input.apply || plan.status !== 'auto-resolvable') {
				return { ...plan, applied: false };
			}

			const project = this.#buildCanonicalProject(loaded, plan);
			const features = plan.mergedFeatures.map((m) => m.content as Record<string, unknown>);
			const stamp = this.clock.nowIso().replace(/[:.]/g, '-');

			// Filesystem first: stage + atomically promote the canonical folder.
			await this.store.promoteCanonical({
				canonicalKernelId: plan.canonicalKernelId,
				project,
				features,
				quarantineStamp: stamp
			});
			// Then quarantine every losing source (recoverable, never deleted).
			for (const action of plan.quarantineActions) {
				await this.store.quarantine(action.folderKey, stamp);
			}
			// Link update comes LAST, only after the filesystem succeeded. Best-effort:
			// a link hiccup must not undo a completed, correct reconciliation.
			try {
				await this.backLinks.markStatus(input.projectId, 'linked');
			} catch {
				// left for the next integrity run to reconcile
			}

			return { ...plan, applied: true };
		});
	}

	/** Preserve the winner's manifest metadata, but force the canonical id + merged feature set. */
	#buildCanonicalProject(
		loaded: Awaited<ReturnType<ReconciliationStorePort['loadCandidates']>>,
		plan: ReconciliationPlan
	): Record<string, unknown> {
		const base =
			loaded.find((f) => f.folderKey === plan.canonicalKernelId)?.project ??
			loaded.find((f) => f.project)?.project ??
			{};
		return {
			...base,
			id: plan.canonicalKernelId,
			name: plan.canonicalManifest.name,
			featureIds: plan.canonicalManifest.featureIds
		};
	}
}
