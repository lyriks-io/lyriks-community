/**
 * Render the data model as a Mermaid `erDiagram` — the classic "boxes with
 * fields, connected by cardinality" map. Pure: draft in, diagram source out.
 * The UI hands the returned string to a Mermaid renderer.
 *
 * Cardinality is read off the relation fields:
 *   - a `relation` list field   → the owner has MANY of the target  (`||--o{`)
 *   - a required `relation`      → the owner has exactly ONE target  (`}o--||`)
 *   - an optional `relation`     → the owner has zero-or-one target  (`}o--o|`)
 */
import { rootFieldsOfEntity, type ProjectDataDraft } from './draft';
import type { FieldType } from './enums';

/** Mermaid entity/attribute tokens must be word-ish; fall back when a name is blank. */
function ident(name: string, fallback: string): string {
	const cleaned = name.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
	return cleaned || fallback;
}

/** A relation attribute shows the target table name as its type; others show the field type. */
function attrType(fieldType: FieldType, targetName: string | null): string {
	if (fieldType === 'relation') return ident(targetName ?? 'ref', 'ref');
	return fieldType;
}

export function toErDiagram(draft: ProjectDataDraft): string {
	const { entities } = draft;
	if (entities.length === 0) {
		return 'erDiagram\n  %% No table yet — model your tables to see the data map.';
	}

	// Stable, unique token per entity (Mermaid needs identifiers, not display text).
	const tokenOf = new Map<string, string>();
	const seen = new Set<string>();
	entities.forEach((e, i) => {
		let base = ident(e.name, `Table${i + 1}`);
		let token = base;
		let n = 2;
		while (seen.has(token)) token = `${base}_${n++}`;
		seen.add(token);
		tokenOf.set(e.id, token);
	});

	const lines: string[] = ['erDiagram'];

	// Entity blocks: one attribute per root field, PK/FK annotated.
	for (const entity of entities) {
		const token = tokenOf.get(entity.id)!;
		const fields = rootFieldsOfEntity(draft, entity.id);
		lines.push(`  ${token} {`);
		if (fields.length === 0) {
			lines.push('    string id PK');
		} else {
			for (const f of fields) {
				const target = f.relationTargetEntityId
					? (entities.find((e) => e.id === f.relationTargetEntityId)?.name ?? null)
					: null;
				const type = attrType(f.type, target);
				const key = f.isId ? ' PK' : f.type === 'relation' ? ' FK' : f.isUnique ? ' UK' : '';
				const name = ident(f.name, 'field') + (f.isList ? '_list' : '');
				lines.push(`    ${type} ${name}${key}`);
			}
		}
		lines.push('  }');
	}

	// Relationships from relation fields whose target exists.
	for (const f of draft.fields) {
		if (f.type !== 'relation' || !f.relationTargetEntityId) continue;
		const from = tokenOf.get(f.entityId);
		const to = tokenOf.get(f.relationTargetEntityId);
		if (!from || !to || from === to) continue;
		const card = f.isList ? '||--o{' : f.isRequired ? '}o--||' : '}o--o|';
		const label = ident(f.name, 'rel');
		lines.push(`  ${from} ${card} ${to} : ${label}`);
	}

	return lines.join('\n');
}
