import {
	createEmptyFeaturesDraft,
	isCoreTone,
	parseActionJourneys,
	type Core,
	type Family,
	type Feature,
	type LeafMeta,
	type ProjectFeaturesDraft
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

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
		: [];

function parseLeafMeta(input: unknown): LeafMeta | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const value = input as Record<string, unknown>;
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
	// The stage set by hand, 1 to 5. A project saved before stages kept a 1-9
	// override under the key `trl`: read once as its stage (half, rounded up) and
	// written back as `stage` at the next save, so no override is lost.
	const stage =
		typeof value.stage === 'number' && Number.isFinite(value.stage)
			? Math.max(1, Math.min(5, Math.round(value.stage)))
			: typeof value.trl === 'number' && Number.isFinite(value.trl)
				? Math.ceil(Math.max(1, Math.min(9, Math.round(value.trl))) / 2)
				: undefined;
	return {
		...(stage !== undefined ? { stage } : {}),
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

/**
 * Anti-corruption guard for untrusted Step 04 payloads. Same shape as
 * parseIdentityDraft / parseDefinitionDraft / parseUsersDraft: merge over defaults,
 * pin projectId. The roadmap's keys (releases, sprints, work assignments, action
 * owners, contributors), the MVP tiers and the per-leaf status left the product:
 * a payload or a stored draft that still carries them parses without them.
 */
export function parseFeaturesDraft(input: unknown, projectId: string): ProjectFeaturesDraft {
	const base = createEmptyFeaturesDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
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
	const featureIds = new Set(features.map((feature) => feature.id));
	const leafMeta = record(src.leafMeta, parseLeafMeta);
	// Orphan rows go, except the ones a live request is using: a value signed on
	// a draft is stored under the draft's own id until the freeze moves it onto
	// the feature. Pruning those here silently destroyed what somebody signed.
	// The evolution side removes them, when the draft is materialised or when the
	// request that carried it is deleted.
	for (const id of Object.keys(leafMeta))
		if (!featureIds.has(id) && !id.startsWith('draft:')) delete leafMeta[id];

	return {
		...base,
		projectId,
		// Unknown tones (e.g. legacy/seed `'ops'`) would crash the tree view's
		// colour lookups — coerce anything outside the closed vocabulary to
		// `'custom'` here so the domain never carries an invalid CoreTone.
		cores,
		families,
		features,
		// Lyriks-owned residue object, keyed by feature id. Parse every entry so
		// malformed MCP-authored metadata cannot cross the application boundary.
		leafMeta,
		// The journeys of each feature's actions: only the features the tree holds keep theirs.
		actionJourneys: parseActionJourneys(src.actionJourneys, featureIds)
	};
}
