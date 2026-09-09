import { leafFeatures } from '$domain/features';
import { mapLimit } from '$lib/shared/map-limit';
import type { BehaviorRepositoryPort, CodeAdoptionPort } from '../ports';
import { specVersionOf } from '../spec-version-memo';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';

/**
 * One leaf feature's code-implementation coverage, folded from the engine's
 * implementation-status sidecar (the record `sync_implementation_index` /
 * `report_implementation_status` pushed). `found`/`expected` count the spec
 * entities the sidecar tracks across every action and surface row.
 */
export interface FeatureImplementationCoverage {
	featureId: string;
	found: number;
	expected: number;
	/** 0-100, rounded. */
	percent: number;
	/**
	 * Per-action coverage rows, keyed by kernel action id (surface-scoped rows
	 * have no per-item split; they only feed the feature totals). Optional
	 * because snapshots persisted before this field exist without it; readers
	 * treat absence as "no per-action detail", never as zero.
	 */
	actions?: Readonly<Record<string, ActionImplementationCoverage>>;
	/** ISO timestamp of the last report push; staleness is the reader's signal. */
	updatedAt: string | null;
	/**
	 * ISO timestamp of the kernel feature's last spec edit, null when no shell
	 * exists or it carries none. Read LIVE, while `found`/`expected`/`updatedAt`
	 * are frozen at the last sync, so a reader can tell whether the coverage
	 * still describes the spec it was measured against.
	 */
	specUpdatedAt: string | null;
}

/** One action's own slice of the feature's coverage. */
export interface ActionImplementationCoverage {
	found: number;
	expected: number;
	/** 0-100, rounded. */
	percent: number;
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Engine calls in flight at once. One single-threaded engine answers them all,
 * so width only lengthens the queue, and the whole queue dies when one call in
 * it exceeds its budget and the subprocess is recycled.
 */
const ENGINE_WIDTH = 2;

/** One sidecar row's counts. Older reports may lack expectedEntities;
 *  found+missing is the same set. */
function rowCountsOf(raw: unknown): { row: Record<string, unknown>; found: number; expected: number } {
	const row = (raw ?? {}) as Record<string, unknown>;
	const found = arr(row.foundEntities).length;
	const expected = arr(row.expectedEntities).length || found + arr(row.missingEntities).length;
	return { row, found, expected };
}

/** Fold one sidecar payload into counts (feature totals + a per-action split);
 *  null when it tracks nothing yet. */
function coverageOf(value: Readonly<Record<string, unknown>>): {
	found: number;
	expected: number;
	actions: Readonly<Record<string, ActionImplementationCoverage>>;
	updatedAt: string | null;
} | null {
	const actionRows = arr(value.actions);
	const rows = [...actionRows, ...arr(value.surfaces)];
	if (rows.length === 0) return null;
	let found = 0;
	let expected = 0;
	for (const raw of rows) {
		const counts = rowCountsOf(raw);
		found += counts.found;
		expected += counts.expected;
	}
	if (expected === 0) return null;
	const actions: Record<string, ActionImplementationCoverage> = {};
	for (const raw of actionRows) {
		const counts = rowCountsOf(raw);
		const actionId = typeof counts.row.actionId === 'string' ? counts.row.actionId : '';
		if (!actionId || counts.expected === 0) continue;
		actions[actionId] = {
			found: counts.found,
			expected: counts.expected,
			percent: Math.round((counts.found / counts.expected) * 100)
		};
	}
	return {
		found,
		expected,
		actions,
		updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
	};
}

/**
 * Reads per-leaf implementation coverage for the Features page: which share of
 * each feature's spec entities the last code-adoption sync located in the
 * implementation repo. Fail-soft by construction: engine off, feature never
 * adopted, or any engine error simply yields no entry, and the UI shows
 * nothing rather than an error (a chip only exists when a score exists).
 */
export class LoadImplementationCoverageUseCase {
	constructor(
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly adoption: CodeAdoptionPort,
		private readonly behavior: BehaviorRepositoryPort
	) {}

	async execute(projectId: string): Promise<Record<string, FeatureImplementationCoverage>> {
		if (!this.adoption.available) return {};
		const features = await this.loadFeatures.execute(projectId);
		const rows = await mapLimit(
			leafFeatures(features),
			ENGINE_WIDTH,
			async (leaf): Promise<FeatureImplementationCoverage | null> => {
				const result = await this.adoption.getImplementationStatus(leaf.id).catch(() => null);
				if (!result?.ok) return null;
				const coverage = coverageOf(result.value);
				if (!coverage) return null;
				// Same fail-soft rule as the sidecar read: an unreadable shell costs the
				// staleness signal, never the coverage row.
				const snapshot = await this.behavior.loadFeature(projectId, leaf.id).catch(() => null);
				return {
					featureId: leaf.id,
					...coverage,
					percent: Math.round((coverage.found / coverage.expected) * 100),
					specUpdatedAt: specVersionOf(snapshot)
				};
			}
		);
		return Object.fromEntries(
			rows.filter((row): row is FeatureImplementationCoverage => row !== null).map((row) => [
				row.featureId,
				row
			])
		);
	}
}
