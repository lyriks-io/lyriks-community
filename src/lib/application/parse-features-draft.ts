import {
	createEmptyFeaturesDraft,
	isCoreTone,
	isMvpTier,
	type Core,
	type Family,
	type Feature,
	type LeafMeta,
	type ProjectFeaturesDraft,
	type Sprint,
	type WorkAssignment,
	type WorkStatus,
	type WorkTargetKind,
	WORK_STATUSES
} from '$domain/features';
import { parseStableRecords } from './parse-stable-records';

/**
 * Force the tree-position fields onto the invariant the domain relies on:
 * `coreId` is a string and `parentFamilyId` is `string | null` — never
 * `undefined`. The tree helpers test `parentFamilyId === null` strictly, so a
 * family/feature authored without the field (e.g. via the MCP `set_section`)
 * would otherwise be `undefined`, fail that test, and silently vanish from the
 * board (its leaves counted but not rendered).
 */
function normalizeNode<T extends { coreId?: unknown; parentFamilyId?: unknown }>(node: T): T {
	return {
		...node,
		coreId: typeof node.coreId === 'string' ? node.coreId : '',
		parentFamilyId: typeof node.parentFamilyId === 'string' ? node.parentFamilyId : null
	};
}

/** Keep the entries of a plain object whose value passes `keep`, dropping the rest. */
function record<T>(input: unknown, keep: (value: unknown) => T | null): Record<string, T> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
	const out: Record<string, T> = {};
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		const kept = keep(value);
		if (kept !== null) out[key] = kept;
	}
	return out;
}

const WORK_KINDS: readonly WorkTargetKind[] = ['core', 'feature', 'action'];

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
		: [];

function parseLeafMeta(input: unknown): LeafMeta | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const value = input as Record<string, unknown>;
	const status = ['backlog', 'in-progress', 'done'].includes(String(value.status))
		? (value.status as LeafMeta['status'])
		: undefined;
	const acceptanceCriteria = Array.isArray(value.acceptanceCriteria)
		? value.acceptanceCriteria.flatMap((candidate) => {
				if (!candidate || typeof candidate !== 'object') return [];
				const criterion = candidate as Record<string, unknown>;
				return typeof criterion.id === 'string' && typeof criterion.text === 'string'
					? [{ id: criterion.id, text: criterion.text }]
					: [];
			})
		: [];
	const uniqueCriteria = acceptanceCriteria.filter(
		(criterion, index, all) => all.findIndex((other) => other.id === criterion.id) === index
	);
	const trl =
		typeof value.trl === 'number' && Number.isFinite(value.trl)
			? Math.max(1, Math.min(9, Math.round(value.trl)))
			: undefined;
	return {
		...(status ? { status } : {}),
		...(trl !== undefined ? { trl } : {}),
		...(str(value.objective) !== undefined ? { objective: str(value.objective) } : {}),
		...(str(value.expectedEffect) !== undefined
			? { expectedEffect: str(value.expectedEffect) }
			: {}),
		...(str(value.problem) !== undefined ? { problem: str(value.problem) } : {}),
		...(str(value.value) !== undefined ? { value: str(value.value) } : {}),
		...(str(value.code) !== undefined ? { code: str(value.code) } : {}),
		...(uniqueCriteria.length > 0 ? { acceptanceCriteria: uniqueCriteria } : {}),
		...(strings(value.dependsOn).length > 0 ? { dependsOn: strings(value.dependsOn) } : {}),
		...(strings(value.sourceIds).length > 0 ? { sourceIds: strings(value.sourceIds) } : {}),
		...(str(value.sourceLink) !== undefined ? { sourceLink: str(value.sourceLink) } : {})
	};
}

/** Keep only well-formed sprints; coerce `order` to a finite number. */
function parseSprints(input: unknown): Sprint[] {
	if (!Array.isArray(input)) return [];
	const out: Sprint[] = [];
	const seen = new Set<string>();
	for (const raw of input) {
		if (!raw || typeof raw !== 'object') continue;
		const s = raw as Record<string, unknown>;
		if (typeof s.id !== 'string' || !s.id || seen.has(s.id)) continue;
		seen.add(s.id);
		out.push({
			id: s.id,
			name: typeof s.name === 'string' ? s.name : '',
			startDate: str(s.startDate),
			endDate: str(s.endDate),
			order: num(s.order),
			...(str(s.archivedAt) ? { archivedAt: str(s.archivedAt) } : {})
		});
	}
	return out;
}

/**
 * Keep only well-formed assignments. A malformed `kind`, a missing target id for
 * that kind, or a non-string-non-null `assigneeId` drops the entry — so an
 * untrusted (or MCP-authored) payload can never inject a dangling work item.
 */
function parseAssignments(input: unknown): WorkAssignment[] {
	if (!Array.isArray(input)) return [];
	const out: WorkAssignment[] = [];
	const seen = new Set<string>();
	for (const raw of input) {
		if (!raw || typeof raw !== 'object') continue;
		const a = raw as Record<string, unknown>;
		if (typeof a.id !== 'string' || !a.id || seen.has(a.id)) continue;
		const kind = a.kind as WorkTargetKind;
		if (!WORK_KINDS.includes(kind)) continue;
		const coreId = str(a.coreId);
		const featureId = str(a.featureId);
		const actionId = str(a.actionId);
		if (kind === 'core' && !coreId) continue;
		if (kind === 'feature' && !featureId) continue;
		if (kind === 'action' && (!featureId || !actionId)) continue;
		const assigneeId = a.assigneeId === null ? null : str(a.assigneeId);
		if (assigneeId === undefined) continue; // present-but-not-a-string → reject
		const status = WORK_STATUSES.includes(a.status as WorkStatus)
			? (a.status as WorkStatus)
			: undefined;
		seen.add(a.id);
		out.push({
			id: a.id,
			kind,
			...(coreId ? { coreId } : {}),
			...(featureId ? { featureId } : {}),
			...(actionId ? { actionId } : {}),
			label: str(a.label),
			assigneeId,
			sprintId: a.sprintId === null ? null : (str(a.sprintId) ?? null),
			...(status ? { status } : {}),
			order: num(a.order)
		});
	}
	return out;
}

/**
 * Anti-corruption guard for untrusted Step 04 payloads. Same shape as
 * parseIdentityDraft / parseDefinitionDraft / parseUsersDraft: merge over defaults,
 * pin projectId.
 */
export function parseFeaturesDraft(input: unknown, projectId: string): ProjectFeaturesDraft {
	const base = createEmptyFeaturesDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const arr = <T>(k: string): T[] => (Array.isArray(src[k]) ? (src[k] as T[]) : []);
	const cores = parseStableRecords(src.cores, 'core', (record, id): Core => ({
		...(record as unknown as Core),
		id,
		tone: isCoreTone(record.tone) ? record.tone : 'custom'
	}));
	const families = parseStableRecords(src.families, 'family', (record, id): Family =>
		normalizeNode({ ...(record as unknown as Family), id })
	);
	const features = parseStableRecords(src.features, 'feature', (record, id): Feature =>
		normalizeNode({ ...(record as unknown as Feature), id, unspaghettitFeatureId: id })
	);
	const releases = parseStableRecords(src.releases, 'release', (record, id) => ({
		...record,
		id
	}) as unknown as ProjectFeaturesDraft['releases'][number]);
	const uniqueByFeature = <T extends { featureId: string }>(values: T[]): T[] =>
		values.filter(
			(value, index, all) =>
				typeof value.featureId === 'string' &&
				value.featureId.length > 0 &&
				all.findIndex((other) => other.featureId === value.featureId) === index
		);
	const mvpAssignments = uniqueByFeature(
		arr<ProjectFeaturesDraft['mvpAssignments'][number]>('mvpAssignments').filter((assignment) =>
			isMvpTier(assignment?.tier)
		)
	);
	const roadmapAssignments = uniqueByFeature(
		arr<ProjectFeaturesDraft['roadmapAssignments'][number]>('roadmapAssignments').filter(
			(assignment) => typeof assignment?.releaseId === 'string' && assignment.releaseId.length > 0
		)
	);
	const featureIds = new Set(features.map((feature) => feature.id));
	const coreIds = new Set(cores.map((core) => core.id));
	const releaseIds = new Set(releases.map((release) => release.id));
	const sprints = parseSprints(src.sprints);
	const sprintIds = new Set(sprints.map((sprint) => sprint.id));
	const assignments = parseAssignments(src.assignments)
		.map((assignment) =>
			assignment.sprintId && !sprintIds.has(assignment.sprintId)
				? { ...assignment, sprintId: null }
				: assignment
		)
		.filter((assignment) => {
			if (assignment.kind === 'core')
				return Boolean(assignment.coreId && coreIds.has(assignment.coreId));
			return Boolean(assignment.featureId && featureIds.has(assignment.featureId));
		});
	const leafMeta = record(src.leafMeta, parseLeafMeta);
	for (const id of Object.keys(leafMeta)) if (!featureIds.has(id)) delete leafMeta[id];

	return {
		...base,
		projectId,
		// Unknown tones (e.g. legacy/seed `'ops'`) would crash the tree view's
		// colour lookups — coerce anything outside the closed vocabulary to
		// `'custom'` here so the domain never carries an invalid CoreTone.
		cores,
		families,
		features,
		mvpAssignments: mvpAssignments.filter((assignment) => featureIds.has(assignment.featureId)),
		releases,
		roadmapAssignments: roadmapAssignments.filter(
			(assignment) => featureIds.has(assignment.featureId) && releaseIds.has(assignment.releaseId)
		),
		// Lyriks-owned residue object, keyed by feature id. Parse every entry so
		// malformed MCP-authored metadata cannot cross the application boundary.
		leafMeta,
		// `featureId::actionId` → collaborator id. Only string values survive, so a
		// malformed payload can never inject a non-id owner into the residue.
		actionAssignments: record(src.actionAssignments, (v) => (typeof v === 'string' ? v : null)),
		// Per-action manual TRL (1-9), clamped; anything else dropped entry-by-entry.
		actionTrl: record(src.actionTrl, (v) =>
			typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(9, Math.round(v))) : null
		),
		// Per-action release assignment; only ids of an existing release survive.
		actionRelease: record(src.actionRelease, (v) =>
			typeof v === 'string' && releaseIds.has(v) ? v : null
		),
		// Per-feature/-action RBAC scope → role ids. Role ids live in the Users
		// bounded context, so they can't be validated here; keep only non-empty
		// string arrays (deduped) and drop empties so the residue stays clean.
		featureRoles: record(src.featureRoles, (v) => {
			const ids = strings(v);
			return ids.length > 0 ? ids : null;
		}),
		actionRoles: record(src.actionRoles, (v) => {
			const ids = strings(v);
			return ids.length > 0 ? ids : null;
		}),
		// Work-distribution residue (sprints + assignments) — Lyriks-owned, dropped
		// entry-by-entry when malformed so an MCP/set_section payload can't poison it.
		sprints,
		assignments
	};
}
