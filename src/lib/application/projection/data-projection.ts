import {
	createEmptyDataDraft,
	fieldsOfEntity,
	isFieldType,
	isProtocol,
	type Database,
	type DataEntity,
	type DataVisibilityChoice,
	type EntityField,
	type EntityOrigin,
	type FieldType,
	type Host,
	type Interface,
	type ProjectDataDraft
} from '$domain/data';
import type { FoundationDefinitionDraft } from '$domain/foundation';
import { stepsOfJourney, type ProjectExperienceDraft } from '$domain/experience';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { BehaviorOp } from '$application/ports';
import type { UnspaFeatureSnapshot, UnspaTag } from '$lib/unspa-schema';
import { dataModelFeatureId } from './aux-feature-ids';
import {
	engineProviderLabel,
	engineResourceKind,
	hostResourceScope,
	protocolCrossesNetwork,
	protocolResourceKind,
	protocolResourceScope
} from './resource-vocabulary';

/**
 * The Lyriks-owned RESIDUE for the Data section — everything the behavior kernel
 * cannot hold. The kernel owns the entity + field SET (names, descriptions, the
 * entity→database binding as a resource ref); this owns the infra topology (hosts,
 * databases, interfaces, layout) and the rich Lyriks attrs of each entity/field the
 * unspa entity model can't represent (field flags, exact type, relations, nesting;
 * entity origin/source). Keyed by the wizard's own entity/field ids. Stored in the
 * residue repo under section "data". `derivedEntities` is NOT stored — the load
 * use-case recomputes it from the Step-05 journeys on every read.
 */
export interface DataResidue {
	hosts: Host[];
	databases: Database[];
	interfaces: Interface[];
	lastSavedAt: string | null;
	/** Per-entity attrs the kernel can't hold, keyed by entity id. */
	entityAttrs: Record<string, DataEntityResidue>;
	/** Per-field attrs the kernel can't hold, keyed by field id. */
	fieldAttrs: Record<string, DataFieldResidue>;
	/** Per-data client-visibility override (entity id / field id → choice). */
	visibility?: Record<string, DataVisibilityChoice>;
}

interface DataEntityResidue {
	derivedFrom: EntityOrigin;
	sourceRefId: string | null;
}

interface DataFieldResidue {
	type: FieldType;
	isId: boolean;
	isUnique: boolean;
	isRequired: boolean;
	isList: boolean;
	defaultValue: string;
	relationTargetEntityId: string | null;
	parentFieldId: string | null;
}

export function emptyDataResidue(): DataResidue {
	return {
		hosts: [],
		databases: [],
		interfaces: [],
		lastSavedAt: null,
		entityAttrs: {},
		fieldAttrs: {},
		visibility: {}
	};
}

/* ── on-disk shapes (loose; match the Unspaghettit feature snapshot) ──── */
interface UnspaResource {
	id: string;
	name: string;
	description: string;
	kind: string;
	provider: string;
	scope: string;
	location: string;
	database: string;
	container: string;
	sensitivity: string;
	containsPii: boolean;
	complianceTags: string[];
	accessMode: string;
	authentication: string;
	encryptionAtRest: boolean;
	encryptionInTransit: boolean;
	retention: string;
	owner: string;
}
interface UnspaEntityField {
	id: string;
	name: string;
	type: string;
	description: string;
}
interface UnspaEntity {
	id: string;
	namespace: string;
	description: string;
	fields: UnspaEntityField[];
	resourceId?: string;
}

/* ── id conventions (kernel side) ─────────────────────────────────────── */
const ENT_PREFIX = 'ent-';
const FLD_PREFIX = 'fld-';
const RES_DB_PREFIX = 'res-db-';

function strip(id: string, prefix: string): string {
	return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/**
 * Build the Step-07 data draft by JOINING the behavior kernel (the central Data
 * Model feature's `entities[]` + `resources[]`) with the Lyriks residue. The entity
 * + field SET, their names/descriptions, and each entity's database binding come
 * from the kernel; the residue supplies infra topology and the attrs unspa can't
 * hold. Pure and framework-free — the inverse of `dataDraftToBehaviorOps`.
 * `derivedEntities` is left empty here (the load use-case recomputes it).
 */
export function buildDataProjection(
	projectId: string,
	dataModel: UnspaFeatureSnapshot | null,
	residue: DataResidue | null
): ProjectDataDraft {
	const deco = residue ?? emptyDataResidue();
	const draft = createEmptyDataDraft(projectId);
	draft.hosts = deco.hosts;
	draft.databases = deco.databases;
	draft.interfaces = deco.interfaces;
	draft.visibility = deco.visibility ?? {};
	draft.lastSavedAt = deco.lastSavedAt;

	const kernelEntities = ((dataModel?.feature as { entities?: unknown })?.entities ?? []) as UnspaEntity[];
	const entities: DataEntity[] = [];
	const fields: EntityField[] = [];

	for (const ke of kernelEntities) {
		const entityId = strip(ke.id ?? '', ENT_PREFIX);
		if (!entityId) continue;
		const databaseId =
			typeof ke.resourceId === 'string' && ke.resourceId.startsWith(RES_DB_PREFIX)
				? strip(ke.resourceId, RES_DB_PREFIX)
				: null;
		const ea = deco.entityAttrs[entityId];
		entities.push({
			id: entityId,
			...(ke.id !== `${ENT_PREFIX}${entityId}` ? { kernelEntityId: ke.id } : {}),
			name: ke.namespace ?? '',
			databaseId,
			description: ke.description ?? '',
			derivedFrom: ea?.derivedFrom ?? 'manual',
			sourceRefId: ea?.sourceRefId ?? null
		});
		for (const kf of ke.fields ?? []) {
			const fieldId = strip(kf.id ?? '', FLD_PREFIX);
			if (!fieldId) continue;
			const fa = deco.fieldAttrs[fieldId];
			fields.push({
				id: fieldId,
				...(kf.id !== `${FLD_PREFIX}${fieldId}` ? { kernelFieldId: kf.id } : {}),
				entityId,
				parentFieldId: fa?.parentFieldId ?? null,
				name: kf.name ?? '',
				type: fa?.type ?? reverseFieldType(kf.type),
				isId: fa?.isId ?? false,
				isUnique: fa?.isUnique ?? false,
				isRequired: fa?.isRequired ?? false,
				isList: fa?.isList ?? false,
				defaultValue: fa?.defaultValue ?? '',
				relationTargetEntityId: fa?.relationTargetEntityId ?? null
			});
		}
	}

	draft.entities = entities;
	draft.fields = fields;
	return draft;
}

/** Split the Lyriks-owned residue out of the wizard draft (the write side). */
export function dataResidueFromDraft(draft: ProjectDataDraft): DataResidue {
	const entityAttrs: Record<string, DataEntityResidue> = {};
	for (const e of draft.entities) {
		entityAttrs[e.id] = { derivedFrom: e.derivedFrom, sourceRefId: e.sourceRefId };
	}
	const fieldAttrs: Record<string, DataFieldResidue> = {};
	for (const f of draft.fields) {
		fieldAttrs[f.id] = {
			type: f.type,
			isId: f.isId,
			isUnique: f.isUnique,
			isRequired: f.isRequired,
			isList: f.isList,
			defaultValue: f.defaultValue,
			relationTargetEntityId: f.relationTargetEntityId,
			parentFieldId: f.parentFieldId ?? null
		};
	}
	return {
		hosts: draft.hosts,
		databases: draft.databases,
		interfaces: draft.interfaces,
		lastSavedAt: draft.lastSavedAt,
		entityAttrs,
		fieldAttrs,
		visibility: draft.visibility ?? {}
	};
}

export interface DataOpsContext {
	projectId: string;
	definition: FoundationDefinitionDraft | null;
	experience: ProjectExperienceDraft | null;
	features: ProjectFeaturesDraft | null;
}

/**
 * Turn the data draft into kernel write ops: the central "Data Model" aux feature
 * (every entity + resource), its listing in the project, and the Core-bridge mirror
 * that enriches each consuming leaf feature. The behavioral half of the flip — the
 * infra topology + Lyriks attrs go to the residue via `dataResidueFromDraft`. This
 * is what retires `sync-data-to-unspaghettit`.
 */
export function dataDraftToBehaviorOps(draft: ProjectDataDraft, ctx: DataOpsContext): BehaviorOp[] {
	const enrich = definitionEnrichment(ctx.definition);

	// ── resources (databases + external interfaces) ──
	const resourceById = new Map<string, UnspaResource>();
	for (const db of draft.databases) {
		const host = draft.hosts.find((h) => h.id === db.hostId) ?? null;
		resourceById.set(db.id, databaseResource(db, host, enrich));
	}
	const interfaceResources = draft.interfaces.map(interfaceResource);
	const allResources: UnspaResource[] = [...resourceById.values(), ...interfaceResources];

	// ── entities (with fields + resource binding) ──
	const allEntities: UnspaEntity[] = draft.entities.map((e) =>
		entityNode(e, fieldsOfEntity(draft, e.id), draft.entities, resourceById.get(e.databaseId ?? ''))
	);

	const dmId = dataModelFeatureId(ctx.projectId);
	const ops: BehaviorOp[] = [
		{
			kind: 'upsertDataModelFeature',
			featureId: dmId,
			name: 'Data Model',
			description:
				'Consolidated data ontology projected from Data & Architecture: every entity and the resources (databases, APIs) they live on. Generated; edit in the Lyriks Data & Architecture section.',
			tags: [{ type: 'kind', value: 'data-model' }],
			entities: allEntities as unknown as Record<string, unknown>[],
			resources: allResources as unknown as Record<string, unknown>[]
		},
		{ kind: 'ensureProjectFeatureId', featureId: dmId }
	];

	// ── Core-bridge mirror: entities a leaf uses (via its Core's journeys) ──
	ops.push(...dataMirrorOps(draft, ctx.experience, ctx.features, ctx.definition));

	return ops;
}

/**
 * The Core-bridge mirror ops in isolation: for each leaf feature, the entities it
 * consumes (via its Core's journeys' `stepDataReads`) plus their backing resources,
 * written onto the leaf so its behavior view shows the data it touches. One op per
 * leaf, always — an empty mirror is how stale copies get pruned. Pure, and
 * shared by both write paths — the Data save (as part of the full projection above)
 * and the Experience save, which re-mirrors when `stepDataReads` change without
 * re-touching the Data Model feature. Resources are built with the same definition
 * enrichment as `dataDraftToBehaviorOps` so a re-mirror never churns what the data
 * save wrote.
 */
export function dataMirrorOps(
	data: ProjectDataDraft,
	experience: ProjectExperienceDraft | null,
	features: ProjectFeaturesDraft | null,
	definition: FoundationDefinitionDraft | null
): BehaviorOp[] {
	if (!features || !experience) return [];

	const enrich = definitionEnrichment(definition);
	const resourceById = new Map<string, UnspaResource>();
	for (const db of data.databases) {
		const host = data.hosts.find((h) => h.id === db.hostId) ?? null;
		resourceById.set(db.id, databaseResource(db, host, enrich));
	}
	const entityNodeById = new Map(
		data.entities.map((e) => [
			e.id,
			entityNode(e, fieldsOfEntity(data, e.id), data.entities, resourceById.get(e.databaseId ?? ''))
		])
	);
	const dbResourceForEntity = (e: DataEntity): UnspaResource | undefined =>
		e.databaseId ? resourceById.get(e.databaseId) : undefined;

	const coresByEntityName = entityNameToCores(experience);
	const ops: BehaviorOp[] = [];
	for (const leaf of leafFeatures(features)) {
		const used = data.entities.filter((e) =>
			coresByEntityName.get(e.name.trim().toLowerCase())?.has(leaf.coreId)
		);
		// Emit for EVERY leaf, even with nothing to mirror: the applier prunes the
		// Lyriks-owned copies the projection no longer produces, so a leaf whose
		// Core stopped consuming an entity loses its stale mirror instead of
		// keeping it forever. Engine-authored entities on the leaf are untouched,
		// and the applier skips the write when the mirror is already current.
		const usedEntities = used
			.map((e) => entityNodeById.get(e.id))
			.filter(Boolean) as UnspaEntity[];
		const usedResources = dedupeResources(
			used.map(dbResourceForEntity).filter(Boolean) as UnspaResource[]
		);
		ops.push({
			kind: 'mirrorFeatureData',
			featureId: leaf.id,
			entities: usedEntities as unknown as Record<string, unknown>[],
			resources: usedResources as unknown as Record<string, unknown>[]
		});
	}
	return ops;
}

/* ── mapping helpers (moved from sync-data-to-unspaghettit) ────────────── */

interface Enrichment {
	sensitivity: string;
	containsPii: boolean;
	complianceTags: string[];
	encryptionAtRest: boolean;
	encryptionInTransit: boolean;
	retention: string;
}

/**
 * A compliance TAG, or nothing. `market.regulations` is free text by design, and
 * a whole sentence snake-cased is not a tag: the kernel's tag vocabulary is
 * `gdpr`, `pci_dss`, `iso27001` and friends. Keep entries that still read as a
 * code once normalised (short, no sentence punctuation) and drop the prose,
 * which belongs in the resource description rather than in a tag chip.
 */
function complianceTag(raw: string): string | null {
	const tag = raw.trim().toLowerCase().replace(/\s+/g, '_');
	if (!tag || tag.length > 24) return null;
	return /^[a-z0-9][a-z0-9_-]*$/.test(tag) ? tag : null;
}

/**
 * A retention duration, tolerating the two shapes seen in the wild: the typed
 * `RetentionRule` and a bare sentence (the MCP write path does not validate this
 * field, so authored drafts carry plain strings).
 */
function retentionOf(
	rules: FoundationDefinitionDraft['security']['dataRetention'] | undefined
): string {
	const first: unknown = rules?.[0];
	if (typeof first === 'string') return first.trim() || 'unspecified';
	const duration = (first as { duration?: unknown } | undefined)?.duration;
	return (typeof duration === 'string' && duration.trim()) || 'unspecified';
}

function definitionEnrichment(definition: FoundationDefinitionDraft | null): Enrichment {
	const sec = definition?.security;
	// Regulations are declared once in Market; certifications add SOC2/ISO-style signals.
	const tags = [
		...(definition?.market?.regulations ?? []),
		...(sec?.expectedCertifications ?? [])
	]
		.map((t) => complianceTag(String(t)))
		.filter((t): t is string => t !== null);
	const piiRegex = /(gdpr|hipaa|pci|ccpa|soc2|sox)/;
	const containsPii = (sec?.dataRetention?.length ?? 0) > 0 || tags.some((t) => piiRegex.test(t));
	// `EncryptionScope` is a closed enum (`at_rest` / `in_transit` / `end_to_end`),
	// so each flag reads its own scope. It must NOT fall back to "any entry means
	// both": that turned a declaration of transport encryption into a claim of
	// encryption at rest, and on a product that transmits nothing it asserted a
	// control over a channel that does not exist. Substring matching keeps the
	// free text this field also carries (the write path does not validate it)
	// meaningful without inventing the other half.
	const enc = (sec?.encryption ?? []).map((e) => String(e).toLowerCase());
	const endToEnd = enc.some((e) => e.includes('end_to_end') || e.includes('end-to-end'));
	return {
		sensitivity: containsPii ? 'confidential' : 'internal',
		containsPii,
		complianceTags: tags,
		encryptionAtRest: endToEnd || enc.some((e) => e.includes('rest')),
		encryptionInTransit: endToEnd || enc.some((e) => e.includes('transit')),
		retention: retentionOf(sec?.dataRetention)
	};
}

function databaseResource(db: Database, host: Host | null, enrich: Enrichment): UnspaResource {
	return {
		id: `${RES_DB_PREFIX}${db.id}`,
		name: db.name || 'Database',
		description: db.description || `${engineProviderLabel[db.engine] ?? db.engine} database.`,
		kind: engineResourceKind[db.engine] ?? 'other',
		provider: engineProviderLabel[db.engine] ?? db.engine,
		scope: hostResourceScope[host?.kind ?? 'cloud'] ?? 'cloud',
		location: host?.name || '',
		database: db.name || '',
		container: '',
		sensitivity: enrich.sensitivity,
		containsPii: enrich.containsPii,
		complianceTags: enrich.complianceTags,
		accessMode: 'read_write',
		authentication: 'service_account',
		encryptionAtRest: enrich.encryptionAtRest,
		encryptionInTransit: enrich.encryptionInTransit,
		retention: enrich.retention,
		owner: ''
	};
}

function interfaceResource(iface: Interface): UnspaResource {
	const label = iface.operation || `${iface.fromBrick || '?'} → ${iface.toBrick || '?'}`;
	// An unknown protocol says "other" rather than claiming to be an HTTP API:
	// mislabelling an in-process port as a remote call misstates the architecture.
	const remote = isProtocol(iface.protocol) && protocolCrossesNetwork(iface.protocol);
	return {
		id: `res-if-${iface.id}`,
		name: label,
		description:
			iface.description ||
			`${iface.protocol.toUpperCase()} interface ${iface.fromBrick} → ${iface.toBrick}.`,
		kind: (isProtocol(iface.protocol) && protocolResourceKind[iface.protocol]) || 'other',
		provider: iface.toBrick || '',
		scope: (isProtocol(iface.protocol) && protocolResourceScope[iface.protocol]) || 'external',
		location: '',
		database: '',
		container: iface.operation || '',
		sensitivity: 'internal',
		containsPii: false,
		complianceTags: [],
		accessMode: 'read_write',
		// Only a call that leaves the machine is authenticated and encrypted in
		// transit. Claiming an API key on an in-process port is a false control.
		authentication: remote ? 'api_key' : 'none',
		encryptionAtRest: false,
		encryptionInTransit: remote,
		retention: 'n/a',
		owner: ''
	};
}

const FIELD_TYPE_MAP: Record<string, string> = {
	string: 'string',
	int: 'number',
	decimal: 'number',
	boolean: 'boolean',
	datetime: 'date',
	object: 'string',
	json: 'string',
	enum: 'string',
	uuid: 'string',
	relation: 'string'
};

/** Best-effort inverse of FIELD_TYPE_MAP for a kernel field with no residue attrs. */
function reverseFieldType(unspaType: unknown): FieldType {
	if (isFieldType(unspaType)) return unspaType;
	switch (unspaType) {
		case 'number':
			return 'int';
		case 'boolean':
			return 'boolean';
		case 'date':
			return 'datetime';
		default:
			return 'string';
	}
}

function entityNode(
	entity: DataEntity,
	fields: EntityField[],
	allEntities: DataEntity[],
	resource: UnspaResource | undefined
): UnspaEntity {
	const node: UnspaEntity = {
		id: entity.kernelEntityId ?? `${ENT_PREFIX}${entity.id}`,
		// Store name + description VERBATIM: the kernel is now the source of truth on
		// reload, so injecting a display default (as the old lossy sync did) would
		// corrupt the round-trip — an empty description must come back empty.
		namespace: entity.name,
		description: entity.description,
		// Keep EVERY field (even empty-named, still being authored): the kernel is now
		// the source of the field set on reload, so dropping any loses it.
		fields: fields.map((f) => ({
			id: f.kernelFieldId ?? `${FLD_PREFIX}${f.id}`,
			name: f.name,
			type: FIELD_TYPE_MAP[f.type] ?? 'string',
			description: fieldDescription(f, allEntities)
		}))
	};
	if (resource) node.resourceId = resource.id;
	return node;
}

function fieldDescription(field: EntityField, allEntities: DataEntity[]): string {
	const bits: string[] = [];
	if (field.isId) bits.push('primary key');
	if (field.isUnique) bits.push('unique');
	if (field.isRequired) bits.push('required');
	if (field.isList) bits.push('list');
	if (field.type === 'relation') {
		const target = allEntities.find((e) => e.id === field.relationTargetEntityId);
		bits.push(`→ ${target?.name || 'Unknown'} (FK)`);
	}
	if (field.defaultValue.trim()) bits.push(`default ${field.defaultValue.trim()}`);
	return bits.length ? bits.join(', ') : `${field.type} field`;
}

function dedupeResources(list: UnspaResource[]): UnspaResource[] {
	const seen = new Set<string>();
	return list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** entityName(lowercased) → set of Core ids whose journeys consume it. */
function entityNameToCores(experience: ProjectExperienceDraft): Map<string, Set<string>> {
	const stepToCore = new Map<string, string>();
	for (const journey of experience.journeys) {
		for (const step of stepsOfJourney(experience, journey.id)) {
			stepToCore.set(step.id, journey.coreId);
		}
	}
	const out = new Map<string, Set<string>>();
	for (const read of experience.stepDataReads) {
		const core = stepToCore.get(read.stepId);
		const name = read.entityName.trim().toLowerCase();
		if (!core || !name) continue;
		const set = out.get(name) ?? new Set<string>();
		set.add(core);
		out.set(name, set);
	}
	return out;
}
