/**
 * Step 05 ↔ Step 07 bridge — turn the real data model (entities + fields) into
 * simulator "fake backend" collections, so a list/form in the prototype reads
 * from the same shapes the product will actually persist. Import-once-editable:
 * this produces a plain `BackendCollection` the author can then tweak; it is NOT
 * a live mirror.
 *
 * Pure functions only — no store, no IO.
 */
import type { DataEntity, EntityField, FieldType } from '$domain/data';
import {
	createBackendCollection,
	createBackendField,
	type BackendCollection,
	type BackendField,
	type FakeFieldKind
} from './backend';

/** Case-insensitive "does this field name look like X" helper. */
function nameHas(name: string, ...needles: string[]): boolean {
	const n = name.toLowerCase();
	return needles.some((w) => n.includes(w));
}

/**
 * Best-effort map a typed Step-07 field to a fake-data generator kind. The field
 * TYPE picks the family; for free-form `string`/`enum` the NAME refines it so a
 * column called "email" gets emails and "city" gets cities.
 */
export function fieldTypeToFakeKind(field: { name: string; type: FieldType }): FakeFieldKind {
	const name = field.name ?? '';
	switch (field.type) {
		case 'int':
			return 'number';
		case 'decimal':
			return nameHas(name, 'price', 'amount', 'cost', 'total', 'fee') ? 'price' : 'number';
		case 'boolean':
			return 'boolean';
		case 'datetime':
			return 'date';
		case 'uuid':
		case 'relation':
			return 'id';
		case 'enum':
			return nameHas(name, 'category', 'type', 'kind') ? 'category' : 'status';
		case 'json':
			return 'sentence';
		case 'string':
		default:
			if (nameHas(name, 'email', 'mail')) return 'email';
			if (nameHas(name, 'full name', 'fullname', 'username', 'name')) return 'fullName';
			if (nameHas(name, 'first')) return 'firstName';
			if (nameHas(name, 'company', 'org', 'vendor', 'supplier')) return 'company';
			if (nameHas(name, 'city', 'town')) return 'city';
			if (nameHas(name, 'country')) return 'country';
			if (nameHas(name, 'status', 'state')) return 'status';
			if (nameHas(name, 'category', 'type', 'kind')) return 'category';
			return 'sentence';
	}
}

/**
 * Build an editable backend collection from one entity and its fields. `id`-flagged
 * fields map to the `id` kind regardless of declared type. Fields with no name are
 * skipped; an entity with no usable field still yields a one-field collection so it
 * renders something.
 */
export function entityToCollection(entity: DataEntity, fields: EntityField[]): BackendCollection {
	const owned = fields.filter((f) => f.entityId === entity.id && f.name.trim());
	const builtFields = owned.map((f) =>
		createBackendField({
			name: f.name.trim(),
			kind: f.isId ? 'id' : fieldTypeToFakeKind(f),
			// Declared enum members become the exact value pool the simulator draws
			// from, so a `plan` field seeds free/premium/family — not generic statuses.
			...(f.enumValues && f.enumValues.length > 0 ? { options: f.enumValues } : {})
		})
	);
	return createBackendCollection({
		name: entity.name.trim() || 'Entity',
		fields: builtFields.length > 0 ? builtFields : [createBackendField({ name: 'Name', kind: 'fullName' })],
		seedCount: 5,
		sourceEntityId: entity.id
	});
}

/**
 * The Step-07 entity a collection descends from, if it still exists: recorded
 * provenance first, then a case-insensitive name match (collections imported
 * before provenance existed carry no `sourceEntityId`).
 */
export function sourceEntityOf(
	col: BackendCollection,
	entities: readonly DataEntity[]
): DataEntity | null {
	if (col.sourceEntityId) {
		const byId = entities.find((e) => e.id === col.sourceEntityId);
		if (byId) return byId;
	}
	const key = col.name.trim().toLowerCase();
	if (!key) return null;
	return entities.find((e) => e.name.trim().toLowerCase() === key) ?? null;
}

/** Comparable shape of a field list: ordered (name, kind, value pool) triples. */
function fieldSignature(fields: readonly BackendField[]): string {
	return JSON.stringify(fields.map((f) => [f.name.trim(), f.kind, f.options ?? []]));
}

/**
 * True when re-importing `entity` would change nothing on `col`: same name and
 * the same ordered fields (name, kind, enum pool). Seed count and authored rows
 * are the author's demo-data knobs, never counted as drift.
 */
export function collectionInSync(
	col: BackendCollection,
	entity: DataEntity,
	fields: EntityField[]
): boolean {
	const fresh = entityToCollection(entity, fields);
	return col.name.trim() === fresh.name.trim() && fieldSignature(col.fields) === fieldSignature(fresh.fields);
}

/**
 * Import-or-refresh one entity into a collection list, in place: matched by
 * recorded provenance first, then by (case-insensitive) name for collections
 * imported before provenance existed. Name and fields follow the model; seed
 * count and authored rows are the author's demo-data knobs and are kept.
 * `changed` is true whenever the list was mutated, including a silent
 * provenance backfill on an in-sync legacy match.
 */
export function syncEntityIntoCollections(
	collections: BackendCollection[],
	entity: DataEntity,
	fields: EntityField[]
): { collection: BackendCollection; outcome: 'imported' | 'updated' | 'unchanged'; changed: boolean } {
	const built = entityToCollection(entity, fields);
	const existing =
		collections.find((c) => c.sourceEntityId === entity.id) ??
		collections.find((c) => c.name.trim().toLowerCase() === built.name.trim().toLowerCase());
	if (!existing) {
		collections.push(built);
		return { collection: built, outcome: 'imported', changed: true };
	}
	if (collectionInSync(existing, entity, fields)) {
		const backfill = existing.sourceEntityId !== entity.id;
		if (backfill) existing.sourceEntityId = entity.id;
		return { collection: existing, outcome: 'unchanged', changed: backfill };
	}
	existing.name = built.name;
	existing.fields = built.fields;
	existing.sourceEntityId = entity.id;
	return { collection: existing, outcome: 'updated', changed: true };
}
