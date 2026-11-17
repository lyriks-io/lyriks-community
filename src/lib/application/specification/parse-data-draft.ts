import {
	createEmptyDataDraft,
	isFieldType,
	type Database,
	type DataEntity,
	type DataVisibilityChoice,
	type DataRulesSetup,
	type EntityField,
	type Host,
	type Interface,
	type ProjectDataDraft,
	existenceText,
	parseExistence,
	isOnDelete,
	onDeleteRefusal
} from '$domain/data';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 07 payloads. Merge over defaults,
 * pin projectId. `derivedEntities` is NOT trusted from the client — it is a
 * read-only mirror recomputed server-side on load — so we drop it.
 */
/** The register rows a table cites, each once; nothing when it cites none (criterion 3918b2ea). */
function citationsOf(value: unknown): { sourceIds?: string[] } {
	const ids = Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))] : [];
	return ids.length > 0 ? { sourceIds: ids } : {};
}

export function parseDataDraft(input: unknown, projectId: string): ProjectDataDraft {
	const base = createEmptyDataDraft(projectId);
	if (input === null || typeof input !== 'object') return base;

	const src = input as Record<string, unknown>;
	const fields = parseStableRecords(src.fields, 'field', (f, id): EntityField => ({
		id,
		...(typeof f.kernelFieldId === 'string' && f.kernelFieldId
			? { kernelFieldId: f.kernelFieldId }
			: {}),
		entityId: typeof f.entityId === 'string' ? f.entityId : '',
		parentFieldId: typeof f.parentFieldId === 'string' ? f.parentFieldId : null,
		name: typeof f.name === 'string' ? f.name : '',
		type: isFieldType(f.type) ? f.type : 'string',
		isId: f.isId === true,
		isUnique: f.isUnique === true,
		isRequired: f.isRequired === true,
		isList: f.isList === true,
		defaultValue: typeof f.defaultValue === 'string' ? f.defaultValue : '',
		relationTargetEntityId:
			typeof f.relationTargetEntityId === 'string' ? f.relationTargetEntityId : null,
		...(Array.isArray(f.enumValues) && f.enumValues.some((x) => typeof x === 'string')
			? { enumValues: (f.enumValues as unknown[]).filter((x): x is string => typeof x === 'string') }
			: {}),
		// What a deletion does is a relation's, and a required link never records set_null (criterion 99e7cc77).
		...(f.type === 'relation' && isOnDelete(f.onDelete) && !onDeleteRefusal({ isRequired: f.isRequired === true, isList: f.isList === true }, f.onDelete)
			? { onDelete: f.onDelete }
			: {})
	}));
	const fieldById = new Map(fields.map((f) => [f.id, f]));
	for (const field of fields) {
		const parent = field.parentFieldId ? fieldById.get(field.parentFieldId) : null;
		if (!parent || parent.id === field.id || parent.entityId !== field.entityId) {
			field.parentFieldId = null;
		}
	}

	return {
		...base,
		projectId,
		hosts: parseStableRecords(src.hosts, 'host', (record, id) => ({ ...record, id }) as unknown as Host),
		databases: parseStableRecords(src.databases, 'database', (record, id) => ({
			...record,
			id
		}) as unknown as Database),
		entities: parseStableRecords(src.entities, 'entity', (record, id): DataEntity => ({
			id,
			...(typeof record.kernelEntityId === 'string' && record.kernelEntityId
				? { kernelEntityId: record.kernelEntityId }
				: {}),
			name: typeof record.name === 'string' ? record.name : '',
			databaseId: typeof record.databaseId === 'string' ? record.databaseId : null,
			description: typeof record.description === 'string' ? record.description : '',
			derivedFrom:
				record.derivedFrom === 'journey' ||
				record.derivedFrom === 'feature' ||
				record.derivedFrom === 'manual'
					? record.derivedFrom
					: 'manual',
			sourceRefId: typeof record.sourceRefId === 'string' ? record.sourceRefId : null,
			...citationsOf(record.sourceIds),
			...(record.standalone === true ? { standalone: true as const } : {})
		})),
		fields,
		interfaces: parseStableRecords(src.interfaces, 'interface', (record, id) => ({
			...record,
			id
		}) as unknown as Interface),
		// Client-visibility overrides: keep only 'shown'/'hidden' values so a
		// malformed payload can never inject a bad choice into the residue.
		visibility: parseVisibility(src.visibility),
		rules: parseRules(src.rules),
		derivedEntities: [] // refilled by LoadDataDraftUseCase
	};
}

/**
 * When a record exists, as a person named it per table (a yes-or-no state, or
 * a condition on a status: see parseExistence). The map
 * of generated rules is never taken from a client: the server rebuilds it on
 * every save, so a stale tab can never overwrite it.
 */
function parseRules(input: unknown): DataRulesSetup {
	const existence: Record<string, string> = {};
	const raw = input && typeof input === 'object' ? (input as { existence?: unknown }).existence : undefined;
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		for (const [entityId, path] of Object.entries(raw as Record<string, unknown>)) {
			const condition = typeof path === 'string' ? parseExistence(path) : null;
			if (condition) existence[entityId] = existenceText(condition);
		}
	}
	return { existence, generated: {} };
}

/** Keep only well-formed `'shown'`/`'hidden'` entries from a visibility map. */
function parseVisibility(input: unknown): Record<string, DataVisibilityChoice> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
	const out: Record<string, DataVisibilityChoice> = {};
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (value === 'shown' || value === 'hidden') out[key] = value;
	}
	return out;
}
