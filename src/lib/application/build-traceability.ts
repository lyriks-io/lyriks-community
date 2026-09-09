import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { DocumentSource } from '$domain/documents';
import type { BehaviorOverview } from './summarize-behavior';

/**
 * A feature-centric traceability row: for one leaf requirement, which links
 * exist and which are missing. Deterministic projection over the Features draft
 * (Lyriks-owned metadata) joined to the behavior overview (kernel counts) — no
 * engine, no network. Exposes coverage gaps, which is the point of a matrix.
 */
export interface TraceabilityRow {
	featureId: string;
	name: string;
	coreName: string;
	hasProblem: boolean;
	hasValue: boolean;
	acceptanceCount: number;
	dependencyCount: number;
	hasSource: boolean;
	sourceCount: number;
	missingSourceCount: number;
	surfaceCount: number;
	actionCount: number;
	scenarioCount: number;
	maturity: number;
	mvpTier: string | null;
	releaseName: string | null;
	/** Human labels for the links this requirement is still missing. */
	gaps: string[];
}

export interface TraceabilitySummary {
	featureCount: number;
	withAcceptance: number;
	withBehavior: number;
	withSource: number;
	withRelease: number;
	/** Leaves neither depending on, nor depended on by, any other leaf. */
	orphanCount: number;
}

export interface Traceability {
	rows: TraceabilityRow[];
	summary: TraceabilitySummary;
}

const nonEmpty = (v: string | undefined) => !!v && v.trim().length > 0;

export function buildTraceability(
	features: ProjectFeaturesDraft,
	behavior: BehaviorOverview,
	sources: readonly DocumentSource[] = []
): Traceability {
	const leaves = leafFeatures(features);
	const coreName = new Map(features.cores.map((c) => [c.id, c.name]));
	const mvpTier = new Map(features.mvpAssignments.map((m) => [m.featureId, m.tier]));
	const releaseName = new Map(features.releases.map((r) => [r.id, r.name]));
	const releaseOf = new Map(features.roadmapAssignments.map((a) => [a.featureId, a.releaseId]));
	const behaviorById = new Map(behavior.features.map((f) => [f.featureId, f]));
	const sourceIds = new Set(sources.map((source) => source.id));

	// A leaf is "connected" if it depends on, or is depended on by, another leaf.
	const dependedOn = new Set<string>();
	for (const leaf of leaves) {
		for (const dep of features.leafMeta?.[leaf.id]?.dependsOn ?? []) dependedOn.add(dep);
	}

	const rows = leaves.map((leaf): TraceabilityRow => {
		const meta = features.leafMeta?.[leaf.id] ?? {};
		const beh = behaviorById.get(leaf.id);
		const surfaceCount = beh?.surfaceCount ?? 0;
		const actionCount = beh?.actionCount ?? 0;
		const acceptanceCount = (meta.acceptanceCriteria ?? []).filter((c) => c.text.trim()).length;
		const dependencyCount = (meta.dependsOn ?? []).length;
		const linkedSourceIds = [...new Set(meta.sourceIds ?? [])];
		const validSourceCount = linkedSourceIds.filter((id) => sourceIds.has(id)).length;
		const missingSourceCount = linkedSourceIds.length - validSourceCount;
		const sourceCount = validSourceCount + (nonEmpty(meta.sourceLink) ? 1 : 0);
		const hasSource = sourceCount > 0;
		const relId = releaseOf.get(leaf.id) ?? null;
		const relName = relId ? (releaseName.get(relId) ?? null) : null;

		const gaps: string[] = [];
		if (acceptanceCount === 0) gaps.push('acceptance criteria');
		if (surfaceCount === 0 && actionCount === 0) gaps.push('behavior');
		if (!hasSource) gaps.push('source');
		if (missingSourceCount > 0) gaps.push(
			`${missingSourceCount} broken source ${missingSourceCount === 1 ? 'reference' : 'references'}`
		);
		if (!relName) gaps.push('release');

		return {
			featureId: leaf.id,
			name: leaf.name,
			coreName: (leaf.coreId && coreName.get(leaf.coreId)) || '',
			hasProblem: nonEmpty(meta.problem),
			hasValue: nonEmpty(meta.value),
			acceptanceCount,
			dependencyCount,
			hasSource,
			sourceCount,
			missingSourceCount,
			surfaceCount,
			actionCount,
			scenarioCount: beh?.scenarioCount ?? 0,
			maturity: beh?.maturity ?? 0,
			mvpTier: mvpTier.get(leaf.id) ?? null,
			releaseName: relName,
			gaps
		};
	});

	return {
		rows,
		summary: {
			featureCount: rows.length,
			withAcceptance: rows.filter((r) => r.acceptanceCount > 0).length,
			withBehavior: rows.filter((r) => r.surfaceCount > 0 || r.actionCount > 0).length,
			withSource: rows.filter((r) => r.hasSource).length,
			withRelease: rows.filter((r) => r.releaseName).length,
			orphanCount: rows.filter(
				(r) => r.dependencyCount === 0 && !dependedOn.has(r.featureId)
			).length
		}
	};
}
