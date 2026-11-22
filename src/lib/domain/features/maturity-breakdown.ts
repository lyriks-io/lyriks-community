import type { ProjectFeaturesDraft } from './draft';

/**
 * Re-aggregations of per-leaf behavioral maturity along the product axes:
 * individual features and core features. The scores come
 * from the coherence analysis (`CoherenceAnalysis.featureMaturity`); these
 * helpers only group and average them, so the number can never drift from the
 * maturity dimension the readiness gate uses.
 */

/** One row of a maturity re-aggregation (a feature or a core feature). */
export interface MaturityBreakdownRow {
	id: string;
	name: string;
	/** Secondary line: the core feature's name on a feature row, empty on a core row. */
	detail: string;
	/** Average maturity of the row's leaves (0-100) — null when it has no leaves. */
	score: number | null;
	/** How many leaf features the average covers. */
	featureCount: number;
}

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
