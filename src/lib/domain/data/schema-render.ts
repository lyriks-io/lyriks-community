import {
	childFieldsOfField,
	rootFieldsOfEntity,
	type DataEntity,
	type EntityField,
	type ProjectDataDraft
} from './draft';

/**
 * Renders one entity as a Prisma-like schema block — the read-only code view in
 * the Schema panel. Generated from the authored fields; the field table is the
 * source of truth, this is just a familiar projection of it.
 */

const PRISMA_TYPE: Record<string, string> = {
	string: 'String',
	int: 'Int',
	decimal: 'Decimal',
	boolean: 'Boolean',
	datetime: 'DateTime',
	object: 'Json',
	json: 'Json',
	enum: 'String',
	uuid: 'String'
};

function pascal(name: string): string {
	const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
	if (!cleaned) return 'Model';
	return cleaned
		.split(/\s+/)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join('');
}

function fieldLine(field: EntityField, draft: ProjectDataDraft, depth = 0): string[] {
	const name = field.name.trim() || 'field';
	let type: string;
	if (field.type === 'relation') {
		const target = draft.entities.find((e) => e.id === field.relationTargetEntityId);
		type = pascal(target?.name || 'Unknown');
	} else {
		type = PRISMA_TYPE[field.type] ?? 'String';
	}
	if (field.isList) type += '[]';
	else if (!field.isRequired && !field.isId) type += '?';

	const attrs: string[] = [];
	if (field.isId) attrs.push('@id');
	if (field.isUnique) attrs.push('@unique');
	if (field.defaultValue.trim()) attrs.push(`@default(${field.defaultValue.trim()})`);
	if (field.type === 'relation' && field.relationTargetEntityId) {
		const target = draft.entities.find((e) => e.id === field.relationTargetEntityId);
		if (target) attrs.push(`// FK ${pascal(target.name)}`);
	}

	const indent = '  '.repeat(depth + 1);
	const lines = [`${indent}${name} ${type}${attrs.length ? ' ' + attrs.join(' ') : ''}`];
	const children = childFieldsOfField(draft, field.id);
	if (children.length > 0) {
		lines.push(`${indent}// ${name} {`);
		for (const child of children) lines.push(...fieldLine(child, draft, depth + 1));
		lines.push(`${indent}// }`);
	}
	return lines;
}

export function renderEntitySchema(entity: DataEntity, draft: ProjectDataDraft): string {
	const fields = rootFieldsOfEntity(draft, entity.id);
	const body = fields.length
		? fields.flatMap((f) => fieldLine(f, draft)).join('\n')
		: '  // no fields yet';
	return `model ${pascal(entity.name)} {\n${body}\n}`;
}
