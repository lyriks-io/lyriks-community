import {
	createEmptyDataDraft,
	isFieldType,
	type Database,
	type DataEntity,
	type DataVisibilityChoice,
	type EntityField,
	type Host,
	type Interface,
	type ProjectDataDraft
} from '$domain/data';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Step 07 payloads. Merge over defaults,
 * pin projectId. `derivedEntities` is NOT trusted from the client — it is a
 * read-only mirror recomputed server-side on load — so we drop it.
 */
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
			sourceRefId: typeof record.sourceRefId === 'string' ? record.sourceRefId : null
		})),
		fields,
		interfaces: parseStableRecords(src.interfaces, 'interface', (record, id) => ({
			...record,
			id
		}) as unknown as Interface),
		// Client-visibility overrides: keep only 'shown'/'hidden' values so a
		// malformed payload can never inject a bad choice into the residue.
		visibility: parseVisibility(src.visibility),
		derivedEntities: [] // refilled by LoadDataDraftUseCase
	};
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
