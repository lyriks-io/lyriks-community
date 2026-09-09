import type { ProjectDataDraft } from '$domain/data';
import type { ProjectExperienceDraft } from '$domain/experience';

/**
 * Which data (entities + fields) the CLIENT EXPERIENCE actually surfaces, derived
 * from the experience model — not a stored flag. A data is "visible" when a
 * client screen reads or displays it; the Data Inventory tab cross-checks this
 * against the whole data model to reveal anything that dropped off the UI.
 *
 * Sources of truth (union), mirroring experience coverage dimension 5:
 *  - `stepDataReads[].entityName` + `.fields` — what a journey step consumes,
 *  - `builder.collections[].name` + `.fields` — the fake backend a screen lists,
 *  - element `wiring.binding.targetKind === 'entity'` — a widget bound to a table.
 *
 * Field rule: a field is visible when its entity is surfaced AND either the
 * entity is surfaced generically (no explicit field list ⇒ the whole record is
 * shown, so every field counts) OR the field name appears in an explicit list.
 */
export interface DerivedDataVisibility {
	/** Ids of entities the experience surfaces. */
	entityIds: string[];
	/** Ids of fields the experience surfaces. */
	fieldIds: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

export function deriveDataVisibility(
	data: ProjectDataDraft,
	experience: ProjectExperienceDraft
): DerivedDataVisibility {
	// ── Entity names the experience surfaces, and the explicit field names each
	// surfaced entity exposes (empty set ⇒ surfaced generically / whole record).
	const surfacedEntities = new Set<string>();
	const explicitFields = new Map<string, Set<string>>();
	const noteEntity = (name: unknown) => {
		if (typeof name === 'string' && name.trim()) surfacedEntities.add(norm(name));
	};
	const noteFields = (name: unknown, fields: readonly string[]) => {
		if (typeof name !== 'string' || !name.trim()) return;
		const key = norm(name);
		const set = explicitFields.get(key) ?? new Set<string>();
		for (const f of fields) if (typeof f === 'string' && f.trim()) set.add(norm(f));
		explicitFields.set(key, set);
	};

	for (const read of experience.stepDataReads ?? []) {
		noteEntity(read.entityName);
		if (Array.isArray(read.fields) && read.fields.length > 0) noteFields(read.entityName, read.fields);
	}
	for (const collection of experience.builder?.collections ?? []) {
		noteEntity(collection.name);
		const names = (collection.fields ?? []).map((f) => f.name).filter(Boolean);
		if (names.length > 0) noteFields(collection.name, names);
	}
	for (const node of Object.values(experience.builder?.nodes ?? {})) {
		if (node.kind !== 'element') continue;
		const binding = node.wiring?.binding;
		if (binding?.targetKind === 'entity') noteEntity(binding.targetRef);
	}

	const entityIds: string[] = [];
	const entityNameById = new Map(data.entities.map((e) => [e.id, norm(e.name)]));
	for (const entity of data.entities) {
		if (surfacedEntities.has(norm(entity.name))) entityIds.push(entity.id);
	}

	const fieldIds: string[] = [];
	for (const field of data.fields) {
		const entityName = entityNameById.get(field.entityId);
		if (!entityName || !surfacedEntities.has(entityName)) continue; // table not shown
		const explicit = explicitFields.get(entityName);
		// No explicit list ⇒ the whole record is surfaced; otherwise gate on the name.
		if (!explicit || explicit.size === 0 || explicit.has(norm(field.name))) fieldIds.push(field.id);
	}

	return { entityIds, fieldIds };
}
