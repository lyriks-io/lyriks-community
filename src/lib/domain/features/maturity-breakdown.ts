import type { ProjectFeaturesDraft } from './draft';

/**
 * Re-aggregations of per-leaf behavioral maturity along the product and delivery
 * axes: individual features, core features and releases. The scores come
 * from the coherence analysis (`CoherenceAnalysis.featureMaturity`); these
 * helpers only group and average them, so the number can never drift from the
 * maturity dimension the readiness gate uses.
 */

/** One row of a maturity re-aggregation (a core feature or a release). */
export interface MaturityBreakdownRow {
	id: string;
	name: string;
	/** Secondary line — the release version + week range; empty for cores. */
	detail: string;
	/** Average maturity of the row's leaves (0-100) — null when it has no leaves. */
	score: number | null;
	/** How many leaf features the average covers. */
	featureCount: number;
}

/** Synthetic row id for leaves not planned into any release. */
export const UNPLANNED_RELEASE_ID = '__unplanned__';

function averageOf(ids: readonly string[], maturity: Record<string, number>): number | null {
	if (ids.length === 0) return null;
	// A leaf missing from the map has no authored behavior — honest 0, not a skip.
	return Math.round(ids.reduce((s, id) => s + (maturity[id] ?? 0), 0) / ids.length);
}

/** Maturity per leaf feature, in authored tree order. */
export function maturityByFeature(
	draft: ProjectFeaturesDraft,
	maturity: Record<string, number>
): MaturityBreakdownRow[] {
	const coreNames = new Map(draft.cores.map((core) => [core.id, core.name]));
	return draft.features.map((feature) => ({
		id: feature.id,
		name: feature.name,
		detail: coreNames.get(feature.coreId) ?? '',
		score: maturity[feature.id] ?? 0,
		featureCount: 1
	}));
}

/** Maturity per core feature, in authored order. Cores without leaves stay listed
 *  (score null) — an empty core is a plan the user should see, not hide. */
export function maturityByCore(
	draft: ProjectFeaturesDraft,
	maturity: Record<string, number>
): MaturityBreakdownRow[] {
	return draft.cores.map((core) => {
		const leafIds = draft.features.filter((f) => f.coreId === core.id).map((f) => f.id);
		return {
			id: core.id,
			name: core.name,
			detail: '',
			score: averageOf(leafIds, maturity),
			featureCount: leafIds.length
		};
	});
}

/**
 * Maturity per release, in roadmap order, followed by one {@link UNPLANNED_RELEASE_ID}
 * row (unnamed — the UI labels it) whenever leaves exist that no release covers,
 * so unplanned work is surfaced instead of silently missing from every bucket.
 */
export function maturityByRelease(
	draft: ProjectFeaturesDraft,
	maturity: Record<string, number>
): MaturityBreakdownRow[] {
	const leafIds = new Set(draft.features.map((f) => f.id));
	const byRelease = new Map<string, string[]>();
	const planned = new Set<string>();
	for (const a of draft.roadmapAssignments) {
		if (!leafIds.has(a.featureId)) continue; // orphaned assignment — warnings.ts owns flagging it
		const ids = byRelease.get(a.releaseId) ?? [];
		ids.push(a.featureId);
		byRelease.set(a.releaseId, ids);
		planned.add(a.featureId);
	}

	const rows = [...draft.releases]
		.sort((a, b) => a.order - b.order || a.weekStart - b.weekStart)
		.map((release) => {
			const ids = byRelease.get(release.id) ?? [];
			return {
				id: release.id,
				name: release.name,
				detail: `${release.version} · Weeks ${release.weekStart}–${release.weekEnd}`,
				score: averageOf(ids, maturity),
				featureCount: ids.length
			};
		});

	const unplanned = draft.features.filter((f) => !planned.has(f.id)).map((f) => f.id);
	if (unplanned.length > 0 && draft.releases.length > 0) {
		rows.push({
			id: UNPLANNED_RELEASE_ID,
			name: '',
			detail: '',
			score: averageOf(unplanned, maturity),
			featureCount: unplanned.length
		});
	}
	return rows;
}
