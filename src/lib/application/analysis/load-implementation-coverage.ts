import { leafFeatures } from '$domain/features';
import { mapLimit } from '$lib/shared/map-limit';
import type { BehaviorRepositoryPort, CodeAdoptionPort } from '../ports';
import { specVersionOf } from '../specification/spec-version-memo';
import type { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';

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
	/**
	 * The feature's active acceptance criteria by their last recorded result, as a
	 * newer engine reports them. Absent when the engine sends no criteria: unknown,
	 * never zero.
	 */
	criteria?: CriteriaTally;
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

/** One spec element an action's sync expected, and where the code carries it. */
export interface ImplementationElement {
	/** The engine's entity type: action, rule, invariant, transition, event, state... */
	kind: string;
	/** The spec element's own id (a rule's or an action's), when the sync named it. */
	id?: string;
	name: string;
	/**
	 * Its first location; null when the sync did not locate it, a blank file when
	 * located without one. `snippet` is the signature line the index recorded there.
	 */
	location: { file: string; line: number | null; snippet?: string } | null;
}

/** One action's own slice of the feature's coverage. */
export interface ActionImplementationCoverage {
	found: number;
	expected: number;
	/** 0-100, rounded. */
	percent: number;
	/** Every element the sync expected for the action, in the sync's order (spec: criterion d42a090d). */
	elements?: readonly ImplementationElement[];
	/**
	 * When a passing scenario run against the code last stamped the action's index
	 * entry (`verifiedAt`). Absent when nothing has proven it: located is not proven.
	 */
	provenAt?: string;
}

/**
 * Active acceptance criteria by what last ran against them. Drafts and
 * superseded criteria hold nothing yet, so they are not counted.
 */
export interface CriteriaTally {
	total: number;
	verified: number;
	failing: number;
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const recordOf = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;

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

/** The elements one action row expected, each with where the code carries it. Older
 *  rows lacking expectedEntities list what was found, then what is missing. */
function elementsOf(row: Record<string, unknown>): ImplementationElement[] {
	const keyOf = (entity: Record<string, unknown>) => `${str(entity.entityType)}:${str(entity.entityId)}`;
	const found = new Map(arr(row.foundEntities).map((raw) => [keyOf(recordOf(raw)), recordOf(raw)]));
	const expected = arr(row.expectedEntities).length
		? arr(row.expectedEntities)
		: [...arr(row.foundEntities), ...arr(row.missingEntities)];
	return expected.map(recordOf).flatMap((entity) => {
		if (!str(entity.entityId)) return [];
		const hit = found.get(keyOf(entity));
		const first = hit ? recordOf(arr(hit.locations)[0]) : null;
		const snippet = first ? str(first.snippet) : '';
		return [
			{
				kind: str(entity.entityType),
				id: str(entity.entityId),
				name: str(entity.entityName) || str(hit?.entityName) || str(entity.entityId),
				location: first
					? { file: str(first.file), line: typeof first.line === 'number' ? first.line : null, ...(snippet ? { snippet } : {}) }
					: null
			}
		];
	});
}

/** The `verifiedAt` stamp a passing run left on the row, when there is one. */
function provenAtOf(row: Record<string, unknown>): string | undefined {
	const stamp = recordOf(row.auditMeta).verifiedAt;
	return typeof stamp === 'string' && stamp !== '' ? stamp : undefined;
}

/**
 * The engine's `criteria` block folded into a tally of the active ones; undefined
 * when the engine sent no block. The engine's standing reads `active` (or
 * `active, but superseded by ...`, still in force), `draft` or `superseded ...`.
 */
function criteriaOf(value: Readonly<Record<string, unknown>>): CriteriaTally | undefined {
	if (!Array.isArray(value.criteria)) return undefined;
	const tally: CriteriaTally = { total: 0, verified: 0, failing: 0 };
	for (const row of value.criteria.map(recordOf)) {
		if (!str(row.criterionId)) continue;
		if (!(str(row.standing) || 'active').startsWith('active')) continue;
		tally.total += 1;
		if (row.state === 'verified') tally.verified += 1;
		else if (row.state === 'failing') tally.failing += 1;
	}
	return tally;
}

/** Fold one sidecar payload into counts (feature totals + a per-action split);
 *  null when it tracks nothing yet. */
function coverageOf(value: Readonly<Record<string, unknown>>): {
	found: number;
	expected: number;
	actions: Readonly<Record<string, ActionImplementationCoverage>>;
	criteria?: CriteriaTally;
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
		const provenAt = provenAtOf(counts.row);
		actions[actionId] = {
			found: counts.found,
			expected: counts.expected,
			percent: Math.round((counts.found / counts.expected) * 100),
			elements: elementsOf(counts.row),
			...(provenAt ? { provenAt } : {})
		};
	}
	const criteria = criteriaOf(value);
	return {
		found,
		expected,
		actions,
		...(criteria ? { criteria } : {}),
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
