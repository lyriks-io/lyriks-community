import { fieldsOfEntity, type DataEntity, type ProjectDataDraft } from './draft';

/** An entity counts as "modeled" once it has a field and lives on a real database. */
export function isEntityReady(draft: ProjectDataDraft, entity: DataEntity): boolean {
	const placed = !!entity.databaseId && draft.databases.some((d) => d.id === entity.databaseId);
	return placed && fieldsOfEntity(draft, entity.id).length > 0;
}

/**
 * Minimum bar to unlock Step 08 (Architecture & stack): at least one entity
 * with at least one field, placed on a database. Mirrors the feature invariant
 * on `c5380392`.
 */
export function dataCanAdvance(draft: ProjectDataDraft): boolean {
	return missingDataRequirements(draft).length === 0;
}

export function missingDataRequirements(draft: ProjectDataDraft): string[] {
	const missing: string[] = [];
	if (draft.databases.length === 0) missing.push('one database');
	if (!draft.entities.some((e) => isEntityReady(draft, e))) {
		missing.push('one entity with a field, placed on a database');
	}
	return missing;
}
