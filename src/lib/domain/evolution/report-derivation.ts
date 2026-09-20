import type { EvolutionRequest, ImplementationFinding, Iteration } from './draft';
import { deriveVerdict } from './implementation';
import { stableId } from './ids';

/**
 * The implementation report, DERIVED (ac-evo-impl-2, -3, -4, -9).
 *
 * The input is what the behaviour engine holds for each touched feature after
 * the implementation index was synced from a checkout: which specified entities
 * were expected, which were located in code and where, which tags in the code
 * match nothing in the spec. The lines follow from that crossing alone; nobody's
 * account of the work is read.
 *
 * The payload is taken structurally, in the engine's own vocabulary, because
 * the platform relays it verbatim everywhere else.
 */
export interface LocatedSpan {
	readonly file: string;
	readonly line?: number;
	readonly snippet?: string;
	readonly unverified?: boolean;
	readonly stale?: boolean;
}

export interface StatusEntity {
	readonly entityType: string;
	readonly entityId: string;
	readonly entityName?: string;
	readonly tag?: string;
	readonly locations?: readonly LocatedSpan[];
}

export interface StatusRow {
	readonly actionId?: string;
	readonly actionName?: string;
	readonly surfaceId?: string;
	readonly surfaceName?: string;
	readonly expectedEntities?: readonly StatusEntity[];
	readonly foundEntities?: readonly StatusEntity[];
	readonly missingEntities?: readonly StatusEntity[];
	readonly extraTags?: readonly { readonly tag: string; readonly locations?: readonly LocatedSpan[] }[];
	readonly auditMeta?: { readonly testFile?: string };
}

export interface FeatureStatus {
	readonly actions?: readonly StatusRow[];
	readonly surfaces?: readonly StatusRow[];
}

export interface ReportDerivationInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'iteration' | 'specVersion' | 'leafIds'>;
	/** The engine status of each touched feature; null when the feature has no synced index. */
	readonly statuses: Readonly<Record<string, FeatureStatus | null>>;
	/** The engine status of the other features, to detect what the change disturbed. */
	readonly neighbours: Readonly<Record<string, FeatureStatus | null>>;
	readonly leafNames: Readonly<Record<string, string>>;
}

const rowsOf = (status: FeatureStatus | null): StatusRow[] => [
	...(status?.actions ?? []),
	...(status?.surfaces ?? [])
];

const ownerOf = (row: StatusRow): string =>
	row.actionName ?? row.surfaceName ?? row.actionId ?? row.surfaceId ?? '';

const firstLocation = (entity: StatusEntity | undefined): LocatedSpan | null =>
	entity?.locations?.find((l) => l.file.trim() !== '') ?? null;

/** Something is at the location, whether or not it still matches the signature. */
const located = (entity: StatusEntity | undefined): boolean => firstLocation(entity) !== null;

/** Proven only when a test is attached AND the located span still matches its signature. */
const proven = (entity: StatusEntity | undefined, testPassing: boolean): boolean => {
	const at = firstLocation(entity);
	return testPassing && at !== null && !at.unverified && !at.stale;
};

function line(
	request: ReportDerivationInput['request'],
	key: string,
	fields: Omit<
		ImplementationFinding,
		'id' | 'iteration' | 'specVersion' | 'decision' | 'decidedBy' | 'decidedAt'
	>
): ImplementationFinding {
	return {
		id: stableId('line', request.id, String(request.iteration), key),
		iteration: request.iteration,
		specVersion: request.specVersion,
		decision: 'undecided',
		decidedBy: null,
		decidedAt: null,
		...fields
	};
}

/**
 * One line per specified entity of the touched features (conform, non-conform
 * or missing), one per code tag the spec never asked for (out of scope), and one
 * per neighbouring entity whose located span went stale or unverified in a file
 * the change touches (regression).
 */
export function deriveImplementationReport(input: ReportDerivationInput): ImplementationFinding[] {
	const { request } = input;
	const lines: ImplementationFinding[] = [];
	const touchedFiles = new Set<string>();

	for (const leafId of request.leafIds) {
		const leaf = input.leafNames[leafId] ?? leafId;
		for (const row of rowsOf(input.statuses[leafId] ?? null)) {
			const found = new Map((row.foundEntities ?? []).map((e) => [`${e.entityType}:${e.entityId}`, e]));
			for (const e of row.foundEntities ?? [])
				for (const l of e.locations ?? []) if (l.file) touchedFiles.add(l.file);
			const expected =
				row.expectedEntities && row.expectedEntities.length > 0
					? row.expectedEntities
					: [...(row.foundEntities ?? []), ...(row.missingEntities ?? [])];
			const testPassing = typeof row.auditMeta?.testFile === 'string' && row.auditMeta.testFile !== '';
			for (const entity of expected) {
				const key = `${entity.entityType}:${entity.entityId}`;
				const hit = found.get(key);
				const at = firstLocation(hit);
				const name = entity.entityName ?? hit?.entityName ?? entity.entityId;
				lines.push(
					line(request, `${leafId}:${key}`, {
						verdict: deriveVerdict({
							hasRequirementAnchor: true,
							anchorForeignLeaf: false,
							locatedInCode: located(hit),
							acceptanceTestPassing: proven(hit, testPassing)
						}),
						requirement: `${leaf} › ${ownerOf(row)} › ${entity.entityType} "${name}"`,
						filePath: at?.file ?? '',
						lineRange: at?.line !== undefined ? String(at.line) : '',
						specStatement: `The spec declares the ${entity.entityType} "${name}" on ${ownerOf(row) || leaf}.`,
						codeStatement: at
							? `${at.snippet?.trim() || 'located'}${at.unverified ? ' (unverified: the signature no longer matches)' : at.stale ? ' (stale)' : ''}`
							: 'Nothing was located for it in the synced index.',
						hasRequirementAnchor: true,
						anchorForeignLeaf: false,
						acceptanceTestPassing: proven(hit, testPassing)
					})
				);
			}
			for (const extra of row.extraTags ?? []) {
				const at = extra.locations?.find((l) => l.file.trim() !== '') ?? null;
				lines.push(
					line(request, `${leafId}:extra:${extra.tag}`, {
						verdict: 'out_of_scope',
						requirement: `${leaf} › tag "${extra.tag}" in the code`,
						filePath: at?.file ?? '',
						lineRange: at?.line !== undefined ? String(at.line) : '',
						specStatement: 'Nothing in the spec asks for this.',
						codeStatement: at?.snippet?.trim() || `The code carries the tag ${extra.tag}.`,
						hasRequirementAnchor: false,
						anchorForeignLeaf: false,
						acceptanceTestPassing: false
					})
				);
			}
		}
	}

	for (const [otherId, status] of Object.entries(input.neighbours)) {
		if (request.leafIds.includes(otherId)) continue;
		const other = input.leafNames[otherId] ?? otherId;
		for (const row of rowsOf(status)) {
			for (const entity of row.foundEntities ?? []) {
				const disturbed = (entity.locations ?? []).find(
					(l) => touchedFiles.has(l.file) && (l.unverified || l.stale)
				);
				if (!disturbed) continue;
				const name = entity.entityName ?? entity.entityId;
				lines.push(
					line(request, `${otherId}:${entity.entityType}:${entity.entityId}`, {
						verdict: 'regression',
						requirement: `${other} › ${ownerOf(row)} › ${entity.entityType} "${name}"`,
						filePath: disturbed.file,
						lineRange: disturbed.line !== undefined ? String(disturbed.line) : '',
						specStatement: `Another feature, ${other}, anchors "${name}" in this file.`,
						codeStatement: `Its span is ${disturbed.unverified ? 'unverified' : 'stale'} since the change touched the file.`,
						hasRequirementAnchor: true,
						anchorForeignLeaf: true,
						acceptanceTestPassing: false
					})
				);
			}
		}
	}

	const order: Record<ImplementationFinding['verdict'], number> = {
		regression: 0,
		missing: 1,
		non_conform: 2,
		out_of_scope: 3,
		conform: 4
	};
	return lines.sort((a, b) => order[a.verdict] - order[b.verdict] || a.requirement.localeCompare(b.requirement));
}

/**
 * The request carrying a freshly derived report for its current iteration. Lines
 * of earlier iterations stay; the decisions already taken on a line that is still
 * derived survive the re-run (same id, same decision).
 */
export function withDerivedReport(
	request: EvolutionRequest,
	lines: readonly ImplementationFinding[],
	at: string
): EvolutionRequest {
	const previous = new Map(
		request.implementationFindings
			.filter((l) => l.iteration === request.iteration)
			.map((l) => [l.id, l])
	);
	const merged = lines.map((l) => {
		const before = previous.get(l.id);
		return before && before.decision !== 'undecided'
			? { ...l, decision: before.decision, decidedBy: before.decidedBy, decidedAt: before.decidedAt }
			: l;
	});
	const iterations: Iteration[] = request.iterations.some((i) => i.number === request.iteration)
		? request.iterations.map((i) =>
				i.number === request.iteration && i.reportStatus !== 'closed'
					? { ...i, reportStatus: 'ready' }
					: i
			)
		: [
				...request.iterations,
				{
					number: request.iteration,
					startedAt: at,
					brief: '',
					protectedLineIds: [],
					reportStatus: 'ready'
				}
			];
	return {
		...request,
		iterations,
		implementationFindings: [
			...request.implementationFindings.filter((l) => l.iteration !== request.iteration),
			...merged
		]
	};
}
