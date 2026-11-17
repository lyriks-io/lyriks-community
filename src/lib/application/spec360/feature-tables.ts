import { FIELD_TYPES, type ProjectDataDraft } from '$domain/data';
import { sortByName } from '$domain/shared';
import { text } from './labels';

/**
 * The Data of a feature's page (criterion c72a7e79): each table it uses, from
 * A to Z, its name over its fields in the order the data model declares them;
 * a field pointing at another table names that table (FK), any other field
 * its type. A nested field reads under its parent's name. Pure.
 */

export interface TableFieldView {
	readonly id: string;
	readonly name: string;
	/** The table a foreign key points at; null for any other field. */
	readonly target: string | null;
	/** "Enum", "DateTime": the type of a field that points at no table. */
	readonly type: string;
}

export interface FeatureTableView {
	readonly id: string;
	readonly name: string;
	readonly fields: readonly TableFieldView[];
}

export function featureTables(draft: Pick<ProjectDataDraft, 'entities' | 'fields'>, tableIds: readonly string[]): FeatureTableView[] {
	const nameOf = (id: string | null) => text(draft.entities.find((e) => e.id === id)?.name) || 'Untitled table';
	const byId = new Map(draft.fields.map((f) => [f.id, f] as const));
	const pathOf = (fieldId: string, seen = new Set<string>()): string => {
		const f = byId.get(fieldId);
		if (!f) return '';
		const own = text(f.name) || 'field';
		if (!f.parentFieldId || seen.has(f.parentFieldId)) return own;
		seen.add(fieldId);
		const parent = pathOf(f.parentFieldId, seen);
		return parent ? `${parent}.${own}` : own;
	};
	const tables = [...new Set(tableIds)]
		.filter((id) => draft.entities.some((e) => e.id === id))
		.map((id) => ({
			id,
			name: nameOf(id),
			fields: draft.fields
				.filter((f) => f.entityId === id)
				.map((f) => {
					const foreign = f.type === 'relation' && !!f.relationTargetEntityId;
					return {
						id: f.id,
						name: pathOf(f.id),
						target: foreign ? nameOf(f.relationTargetEntityId) : null,
						type: FIELD_TYPES.find((t) => t.code === f.type)?.label ?? f.type
					};
				})
		}));
	return sortByName(tables);
}
