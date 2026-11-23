import {
	featureCodeOf,
	projectHealth,
	type HealthAuditIssue,
	type HealthCoverageRow,
	type HealthOpenAnalysis,
	type ProjectHealth
} from '$domain/coherence';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { ProjectFoundationDraft } from '$domain/foundation';
import type { CoherenceView } from './load-coherence-draft';
import { codeIsLinked } from './load-implementation-coverage';

interface Loader<T> {
	execute(projectId: string): Promise<T>;
}

/** Where a feature's code-to-spec analysis stands; null when the engine cannot say. */
export interface AnalysisState {
	/** Sources were linked or spans recorded: the analysis was started. */
	readonly started: boolean;
	readonly finalized: boolean;
	readonly untraced: number;
}

/** Reads one feature's analysis state (the engine's provenance). */
export interface AnalysisStateReader {
	read(featureId: string): Promise<AnalysisState | null>;
}

/** The coverage snapshot per feature, as the cached implementation-coverage tier serves it. */
export interface HealthCoverageReader {
	get(projectId: string): Promise<Readonly<Record<string, HealthCoverageRow>>>;
}

/** The completeness audit, read for its issues only. */
export interface HealthAuditReader {
	execute(projectId: string): Promise<{ readonly issues: readonly HealthAuditIssue[] }>;
}

/** Bound the per-feature engine reads, as the coherence checker bounds its own. */
const ANALYSIS_CONCURRENCY = 6;

async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

/**
 * Project health (feat-health-scores, criteria 799e1f5b, 08324382, 7ae9b322):
 * the one state score of a project and every open point it is computed from.
 * The Overview gauge, What Lyriks noticed and every agent read this same value.
 *
 * A reading that cannot be had (the engine down, the audit failing) adds no
 * point: the health says what it knows and never invents a fault.
 */
export class ReadProjectHealthUseCase {
	constructor(
		private readonly coherence: Loader<CoherenceView>,
		private readonly audit: HealthAuditReader,
		private readonly coverage: HealthCoverageReader,
		private readonly features: Loader<ProjectFeaturesDraft>,
		private readonly foundation: Loader<ProjectFoundationDraft>,
		private readonly analyses: AnalysisStateReader
	) {}

	async execute(projectId: string): Promise<ProjectHealth> {
		const [coherence, audit, coverage, features, foundation] = await Promise.all([
			this.coherence.execute(projectId),
			this.audit.execute(projectId).catch(() => ({ issues: [] })),
			this.coverage.get(projectId).catch(() => ({})),
			this.features.execute(projectId),
			this.foundation.execute(projectId)
		]);
		const leaves = leafFeatures(features);
		const names = new Map(leaves.map((f) => [f.id, f.name.trim() || f.id]));
		const rows = Object.values(coverage);
		const openAnalyses =
			foundation.identity.sourceMode === 'code_to_spec' ? await this.openAnalyses(leaves.map((f) => f.id), names) : [];
		const health = projectHealth({
			gaps: coherence.analysis.gaps,
			audit: audit.issues,
			codeLinked: codeIsLinked(coverage),
			features: rows.map((row) => featureCodeOf(row, names.get(row.featureId) ?? row.featureId)),
			openAnalyses
		});
		return coherence.analysis.formalProving === true ? { ...health, proofPending: true } : health;
	}

	private async openAnalyses(featureIds: readonly string[], names: ReadonlyMap<string, string>): Promise<HealthOpenAnalysis[]> {
		const states = await mapBounded(featureIds, ANALYSIS_CONCURRENCY, (id) => this.analyses.read(id).catch(() => null));
		return featureIds.flatMap((featureId, i) => {
			const state = states[i];
			if (!state || !state.started || state.finalized) return [];
			return [{ featureId, name: names.get(featureId) ?? featureId, untraced: state.untraced }];
		});
	}
}
