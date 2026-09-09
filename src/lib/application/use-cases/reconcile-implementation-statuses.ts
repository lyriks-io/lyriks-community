import { leafFeatures, type LeafMeta, type ProjectFeaturesDraft } from '$domain/features';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';
import type {
	FeatureImplementationCoverage,
	LoadImplementationCoverageUseCase
} from './load-implementation-coverage';

type LeafStatus = NonNullable<LeafMeta['status']>;

/** Whether the feature's spec was edited after the coverage snapshot was taken. */
function specMovedSinceSync(cov: FeatureImplementationCoverage): boolean {
	if (!cov.specUpdatedAt || !cov.updatedAt) return false;
	const spec = Date.parse(cov.specUpdatedAt);
	const synced = Date.parse(cov.updatedAt);
	return !Number.isNaN(spec) && !Number.isNaN(synced) && spec > synced;
}

/** One feature whose workflow status the last code-adoption sync justifies raising. */
export interface StatusReconciliation {
	featureId: string;
	name: string;
	from: LeafStatus;
	to: LeafStatus;
	/** Coverage percent that justified the move, for the caller's report. */
	percent: number;
}

export interface ReconcilePlan {
	/** The features draft with every upgrade already applied (unsaved). */
	draft: ProjectFeaturesDraft;
	changes: StatusReconciliation[];
}

/**
 * The coverage→status rules, pure so they are testable and shared verbatim by
 * the server reconcile and the dashboard's client-side "Sync from code":
 *
 *  - every spec entity located in code (`found >= expected`)  → `done`
 *  - some located (`found > 0`) and still `backlog`           → `in-progress`
 *  - NEVER downgrade: coverage is fail-soft (an offline engine reads as "no
 *    data"), so absence of coverage must not reset anyone's roadmap, and a
 *    hand-set `done` is respected even when coverage lags behind.
 *  - NEVER promote on stale evidence: a feature whose spec was edited after the
 *    last sync is skipped entirely, because its counters answer for a spec that
 *    has since changed.
 */
export function planStatusUpgrades(
	draft: ProjectFeaturesDraft,
	coverage: Readonly<Record<string, FeatureImplementationCoverage>>,
	featureIds?: readonly string[]
): StatusReconciliation[] {
	const scope = featureIds ? new Set(featureIds) : null;
	const changes: StatusReconciliation[] = [];
	for (const leaf of leafFeatures(draft)) {
		if (scope && !scope.has(leaf.id)) continue;
		const cov = coverage[leaf.id];
		if (!cov || cov.expected <= 0) continue;
		// The counters were frozen when the index was last synced. If the spec has
		// moved since, they describe a spec that no longer exists, and promoting on
		// them manufactures the very "done but code incomplete" state the roadmap
		// then reports. Re-sync first; this stays silent until someone does.
		if (specMovedSinceSync(cov)) continue;
		const from: LeafStatus = draft.leafMeta?.[leaf.id]?.status ?? 'backlog';
		if (from === 'done') continue;
		const to: LeafStatus | null =
			cov.found >= cov.expected ? 'done' : cov.found > 0 && from === 'backlog' ? 'in-progress' : null;
		if (!to || to === from) continue;
		changes.push({ featureId: leaf.id, name: leaf.name, from, to, percent: cov.percent });
	}
	return changes;
}

/**
 * Align feature workflow statuses with the implementation coverage the code
 * adoption recorded, so "exists as specified in the code" and "marked done on
 * the roadmap" stop drifting apart. Plans only; persisting the returned draft
 * (and the revision/notify protocol around it) belongs to the server edge.
 */
export class ReconcileImplementationStatusesUseCase {
	constructor(
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly loadCoverage: LoadImplementationCoverageUseCase
	) {}

	async execute(
		projectId: string,
		opts: { featureIds?: readonly string[] } = {}
	): Promise<ReconcilePlan> {
		const draft = await this.loadFeatures.execute(projectId);
		// Fresh read, deliberately not the TTL cache: this runs right after a sync
		// landed and must see what that sync wrote. Engine off → `{}` → no changes.
		const coverage = await this.loadCoverage.execute(projectId);
		const changes = planStatusUpgrades(draft, coverage, opts.featureIds);
		if (changes.length > 0) {
			if (!draft.leafMeta) draft.leafMeta = {};
			for (const change of changes) {
				draft.leafMeta[change.featureId] = {
					...draft.leafMeta[change.featureId],
					status: change.to
				};
			}
		}
		return { draft, changes };
	}
}
