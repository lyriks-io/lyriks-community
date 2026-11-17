import type { GraphNodeLike } from './decision-figures';
import { ELEMENT_PATH_PREFIX } from './spec-actions';

/**
 * The data a request changes (ac-evo-draft-data, -data-landing, ac-evo-imp-erd).
 *
 * A request says which tables it adds, which it amends (fields added, changed
 * or removed) and which it removes, as drafts held on the request. Nothing of
 * it reaches the Data section before the change is declared live; then the
 * tables and fields are written under the ids the request gave them.
 *
 * The data model is read here through the shape this context needs, never the
 * Data section's own types: the server adapts one to the other.
 */

export const DATA_DRAFT_PREFIX = 'data:';
export type DataDraftKind = 'add' | 'amend' | 'remove';
export const DATA_FIELD_TYPES = ['string', 'int', 'decimal', 'boolean', 'datetime', 'object', 'json', 'enum', 'uuid', 'relation'] as const;
export type DataFieldType = (typeof DATA_FIELD_TYPES)[number];
export const isDataFieldType = (v: unknown): v is DataFieldType => typeof v === 'string' && (DATA_FIELD_TYPES as readonly string[]).includes(v);

/** A field the request adds. `relationTo` names a table: an existing one by id, or a table this request adds by its draft id. */
export interface DataFieldDraft {
	readonly id: string;
	name: string;
	type: DataFieldType;
	required: boolean;
	list: boolean;
	relationTo: string | null;
}

/** What the request changes in an existing field: only what it sends. */
export interface DataFieldChange {
	readonly fieldId: string;
	name?: string;
	type?: DataFieldType;
	required?: boolean;
	list?: boolean;
	relationTo?: string | null;
}

export interface DataDraft {
	/** `data:<something>`, kept until the change lands. */
	readonly id: string;
	kind: DataDraftKind;
	/** The existing table it amends or removes; null on an addition. */
	entityId: string | null;
	/** The new table's name, or the amended table's new name ('' keeps it). */
	name: string;
	description: string;
	addFields: DataFieldDraft[];
	changeFields: DataFieldChange[];
	/** Ids of the existing fields it removes. */
	removeFields: string[];
	/** Set by the landing: the id the table took, and when. */
	materialisedAs: string | null;
	materialisedAt: string | null;
}

/**
 * A change to the data is validated on the Specification (3.4 Datamap) on a
 * synthetic field whose value is its fingerprint, like a change to the rules:
 * a table or a field changed after a person validated it reads stale.
 */
export const DATA_CHANGE_PATH_PREFIX = `${ELEMENT_PATH_PREFIX}data.`;
export const dataChangeKey = (draft: Pick<DataDraft, 'id'>): string => `${DATA_CHANGE_PATH_PREFIX}${draft.id.slice(DATA_DRAFT_PREFIX.length)}`;
export const dataChangeFingerprint = (draft: Pick<DataDraft, 'kind' | 'entityId' | 'name' | 'description' | 'addFields' | 'changeFields' | 'removeFields'>): string =>
	JSON.stringify({
		kind: draft.kind,
		entityId: draft.entityId,
		name: draft.name,
		description: draft.description,
		addFields: draft.addFields,
		changeFields: draft.changeFields,
		removeFields: draft.removeFields
	});
export const dataDraftOfKey = (drafts: readonly DataDraft[] | undefined, key: string): DataDraft | undefined => (drafts ?? []).find((d) => dataChangeKey(d) === key);
export const liveDataDrafts = (drafts: readonly DataDraft[] | undefined): DataDraft[] => (drafts ?? []).filter((d) => d.materialisedAt === null);
/** The one discussion of 3.4 Datamap, kept on a synthetic field of its own: the section is discussed as one, as it is validated. */
export const DATAMAP_THREAD_KEY = `${ELEMENT_PATH_PREFIX}datamap`;

/** The data model as this context reads it. */
export interface DataModelLike {
	readonly entities: readonly { readonly id: string; readonly name: string }[];
	readonly fields: readonly {
		readonly id: string;
		readonly entityId: string;
		readonly name: string;
		readonly type: string;
		readonly isId?: boolean;
		readonly isUnique?: boolean;
		readonly isRequired?: boolean;
		readonly isList?: boolean;
		readonly relationTargetEntityId?: string | null;
		readonly parentFieldId?: string | null;
	}[];
}

/* ---------------------------------------------------------------- reading */

export type ChangeStatus = 'added' | 'changed' | 'removed' | 'kept';

export interface ErdField {
	readonly name: string;
	readonly type: string;
	readonly key: 'PK' | 'FK' | 'UK' | '';
	readonly status: ChangeStatus;
	/** For a changed field: what it was, in a few words. */
	readonly was?: string;
}

export interface ErdTable {
	readonly id: string;
	readonly name: string;
	/** What the request does to it; `linked` for a table only shown because a touched one points at it. */
	readonly status: 'added' | 'changed' | 'removed' | 'linked';
	readonly fields: readonly ErdField[];
}

export interface ErdLink {
	readonly from: string;
	readonly to: string;
	readonly label: string;
	readonly cardinality: '||--o{' | '}o--||' | '}o--o|';
	readonly status: ChangeStatus;
}

export interface DataChangeView {
	readonly tables: readonly ErdTable[];
	readonly links: readonly ErdLink[];
	/** Counts for one line of reading: tables added, changed, removed; fields added, changed, removed. */
	readonly counts: {
		readonly tablesAdded: number;
		readonly tablesChanged: number;
		readonly tablesRemoved: number;
		readonly fieldsAdded: number;
		readonly fieldsChanged: number;
		readonly fieldsRemoved: number;
	};
}

const describe = (f: { type: string; required?: boolean; list?: boolean }) =>
	`${f.type}${f.list ? ' list' : ''}${f.required ? ', required' : ''}`;
const cardinalityOf = (f: { list?: boolean; required?: boolean }): ErdLink['cardinality'] =>
	f.list ? '||--o{' : f.required ? '}o--||' : '}o--o|';

/**
 * The tables a request touches, as the Data model would draw them after the
 * change, each field marked with what the request does to it, and the tables a
 * touched one is linked to, shown in grey for context (ac-evo-imp-erd).
 */
export function dataChangeView(model: DataModelLike, drafts: readonly DataDraft[]): DataChangeView {
	const live = drafts.filter((d) => d.materialisedAt === null);
	const entityName = new Map(model.entities.map((e) => [e.id, e.name]));
	const draftName = new Map(live.filter((d) => d.kind === 'add').map((d) => [d.id, d.name || 'New table']));
	const nameOf = (id: string | null | undefined) => (id ? (draftName.get(id) ?? entityName.get(id) ?? id) : '');
	const rootFields = (entityId: string) => model.fields.filter((f) => f.entityId === entityId && !f.parentFieldId);

	const tables: ErdTable[] = [];
	const links: ErdLink[] = [];
	const counts = { tablesAdded: 0, tablesChanged: 0, tablesRemoved: 0, fieldsAdded: 0, fieldsChanged: 0, fieldsRemoved: 0 };

	for (const draft of live) {
		if (draft.kind === 'add') {
			counts.tablesAdded += 1;
			counts.fieldsAdded += draft.addFields.length;
			tables.push({
				id: draft.id,
				name: draft.name || 'New table',
				status: 'added',
				fields: [
					...(draft.addFields.some((f) => f.name.toLowerCase() === 'id') ? [] : [{ name: 'id', type: 'uuid', key: 'PK' as const, status: 'added' as const }]),
					...draft.addFields.map((f) => ({ name: f.name, type: f.type === 'relation' ? nameOf(f.relationTo) || 'relation' : f.type, key: (f.type === 'relation' ? 'FK' : '') as ErdField['key'], status: 'added' as const }))
				]
			});
			for (const f of draft.addFields) {
				if (f.type === 'relation' && f.relationTo) links.push({ from: draft.id, to: f.relationTo, label: f.name, cardinality: cardinalityOf(f), status: 'added' });
			}
			continue;
		}
		if (!draft.entityId) continue;
		const existing = rootFields(draft.entityId);
		if (draft.kind === 'remove') {
			counts.tablesRemoved += 1;
			counts.fieldsRemoved += existing.length;
			tables.push({
				id: draft.entityId,
				name: nameOf(draft.entityId),
				status: 'removed',
				fields: existing.map((f) => ({ name: f.name, type: f.type, key: f.isId ? 'PK' : f.type === 'relation' ? 'FK' : f.isUnique ? 'UK' : '', status: 'removed' }))
			});
			for (const f of existing) {
				if (f.type === 'relation' && f.relationTargetEntityId) links.push({ from: draft.entityId, to: f.relationTargetEntityId, label: f.name, cardinality: cardinalityOf({ list: f.isList, required: f.isRequired }), status: 'removed' });
			}
			continue;
		}
		counts.tablesChanged += 1;
		const removed = new Set(draft.removeFields);
		const changes = new Map(draft.changeFields.map((c) => [c.fieldId, c]));
		const fields: ErdField[] = existing.map((f) => {
			const key: ErdField['key'] = f.isId ? 'PK' : f.type === 'relation' ? 'FK' : f.isUnique ? 'UK' : '';
			if (removed.has(f.id)) {
				counts.fieldsRemoved += 1;
				return { name: f.name, type: f.type, key, status: 'removed' };
			}
			const change = changes.get(f.id);
			if (change) {
				counts.fieldsChanged += 1;
				const after = { type: change.type ?? f.type, required: change.required ?? f.isRequired, list: change.list ?? f.isList };
				return { name: change.name || f.name, type: after.type, key, status: 'changed', was: `${f.name}: ${describe({ type: f.type, required: f.isRequired, list: f.isList })}` };
			}
			return { name: f.name, type: f.type, key, status: 'kept' };
		});
		for (const f of draft.addFields) {
			counts.fieldsAdded += 1;
			fields.push({ name: f.name, type: f.type === 'relation' ? nameOf(f.relationTo) || 'relation' : f.type, key: f.type === 'relation' ? 'FK' : '', status: 'added' });
			if (f.type === 'relation' && f.relationTo) links.push({ from: draft.entityId, to: f.relationTo, label: f.name, cardinality: cardinalityOf(f), status: 'added' });
		}
		for (const f of existing) {
			if (f.type !== 'relation' || !f.relationTargetEntityId) continue;
			links.push({
				from: draft.entityId,
				to: f.relationTargetEntityId,
				label: f.name,
				cardinality: cardinalityOf({ list: f.isList, required: f.isRequired }),
				status: removed.has(f.id) ? 'removed' : changes.has(f.id) ? 'changed' : 'kept'
			});
		}
		tables.push({ id: draft.entityId, name: draft.name || nameOf(draft.entityId), status: 'changed', fields });
	}

	// The tables a touched one is linked to, or that point at it: context, in grey.
	const shown = new Set(tables.map((t) => t.id));
	const touchedIds = new Set(shown);
	for (const f of model.fields) {
		if (f.type !== 'relation' || !f.relationTargetEntityId || f.parentFieldId) continue;
		if (touchedIds.has(f.relationTargetEntityId) && !touchedIds.has(f.entityId)) {
			links.push({ from: f.entityId, to: f.relationTargetEntityId, label: f.name, cardinality: cardinalityOf({ list: f.isList, required: f.isRequired }), status: 'kept' });
		}
	}
	for (const link of links) {
		for (const id of [link.from, link.to]) {
			if (shown.has(id) || !entityName.has(id)) continue;
			shown.add(id);
			tables.push({
				id,
				name: entityName.get(id)!,
				status: 'linked',
				fields: rootFields(id)
					.filter((f) => f.isId || f.type === 'relation')
					.map((f) => ({ name: f.name, type: f.type, key: f.isId ? 'PK' : 'FK', status: 'kept' }))
			});
		}
	}
	return { tables, links, counts };
}

/* ---------------------------------------------------------------- diagram */

const ident = (s: string, fallback: string) => {
	const cleaned = s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^A-Za-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return cleaned === '' ? fallback : /^[0-9]/.test(cleaned) ? `T_${cleaned}` : cleaned;
};
const FIELD_NOTE: Record<ChangeStatus, string> = { added: 'added', changed: 'changed', removed: 'removed', kept: '' };

/**
 * The Mermaid erDiagram of a data change, styled with the colour law: blue
 * added, amber changed, red removed, grey linked for context. Each field that
 * moves carries its word as the attribute comment, so the colour is never the
 * only thing that says it.
 */
export function toChangeErDiagram(view: DataChangeView): string {
	if (view.tables.length === 0) return 'erDiagram\n  %% This request changes no data.';
	const token = new Map<string, string>();
	const used = new Set<string>();
	view.tables.forEach((t, i) => {
		const base = ident(t.name, `Table${i + 1}`);
		let name = base;
		for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
		used.add(name);
		token.set(t.id, name);
	});
	const lines = ['erDiagram'];
	for (const t of view.tables) {
		lines.push(`  ${token.get(t.id)} {`);
		const fields = t.fields.length > 0 ? t.fields : [{ name: 'id', type: 'uuid', key: 'PK' as const, status: 'kept' as const }];
		for (const f of fields) {
			const note = FIELD_NOTE[f.status] + (f.status === 'changed' && 'was' in f && f.was ? `, was ${f.was}` : '');
			lines.push(`    ${ident(f.type, 'string')} ${ident(f.name, 'field')}${f.key ? ` ${f.key}` : ''}${note ? ` "${note.replace(/"/g, "'")}"` : ''}`);
		}
		lines.push('  }');
	}
	for (const l of view.links) {
		const from = token.get(l.from);
		const to = token.get(l.to);
		if (!from || !to || from === to) continue;
		lines.push(`  ${from} ${l.cardinality} ${to} : ${ident(l.label, 'rel')}${l.status === 'kept' ? '' : `_${l.status}`}`);
	}
	// What the evolution adds reads in the violet of the Evolution design, as its NEW chips do.
	lines.push('  classDef added fill:#f6f2ff,stroke:#6d3fe6,color:#5b2fc9');
	lines.push('  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f');
	lines.push('  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d');
	lines.push('  classDef linked fill:#f8fafc,stroke:#94a3b8,color:#475569');
	for (const status of ['added', 'changed', 'removed', 'linked'] as const) {
		const ids = view.tables.filter((t) => t.status === status).map((t) => token.get(t.id)!);
		if (ids.length > 0) lines.push(`  class ${ids.join(',')} ${status}`);
	}
	return lines.join('\n');
}

/** What the data change does, element by element, for the size rank (ac-evo-form-decision-size-rank). */
export function dataChangeNodes(view: DataChangeView): GraphNodeLike[] {
	const out: GraphNodeLike[] = [];
	for (const t of view.tables) {
		if (t.status === 'linked') continue;
		if (t.status === 'added' || t.status === 'removed') {
			out.push({ kind: 'entity', label: t.name, status: t.status });
			continue;
		}
		for (const f of t.fields) if (f.status !== 'kept') out.push({ kind: 'field', label: `${t.name}.${f.name}`, status: f.status });
	}
	return out;
}

/* ---------------------------------------------------------------- landing */

export interface LandedData {
	readonly model: {
		entities: { id: string; name: string; description: string }[];
		fields: {
			id: string;
			entityId: string;
			name: string;
			type: string;
			isId?: boolean;
			isRequired: boolean;
			isList: boolean;
			relationTargetEntityId: string | null;
		}[];
	};
	readonly removedEntityIds: readonly string[];
	readonly removedFieldIds: readonly string[];
	readonly changedFields: readonly DataFieldChange[];
	readonly renamed: readonly { id: string; name: string }[];
	readonly lines: readonly string[];
}

/**
 * What landing the data changes writes (ac-evo-draft-data-landing), computed
 * without touching anything: the tables and fields to create under the ids the
 * request gave them, the ones to change, and the ones to remove. A removed
 * table takes its fields and the relations that pointed at it.
 */
export function landingOfData(model: DataModelLike, drafts: readonly DataDraft[]): LandedData {
	const live = drafts.filter((d) => d.materialisedAt === null);
	const out: LandedData = { model: { entities: [], fields: [] }, removedEntityIds: [], removedFieldIds: [], changedFields: [], renamed: [], lines: [] };
	const removedEntities = new Set<string>();
	const removedFields = new Set<string>();
	const changed: DataFieldChange[] = [];
	const renamed: { id: string; name: string }[] = [];
	const lines: string[] = [];
	for (const d of live) {
		if (d.kind === 'add') {
			out.model.entities.push({ id: d.id.slice(DATA_DRAFT_PREFIX.length), name: d.name || 'New table', description: d.description });
		}
	}
	const realId = (id: string | null) => (id && id.startsWith(DATA_DRAFT_PREFIX) ? id.slice(DATA_DRAFT_PREFIX.length) : id);
	for (const d of live) {
		const entityId = d.kind === 'add' ? realId(d.id)! : d.entityId;
		if (!entityId) continue;
		if (d.kind === 'remove') {
			removedEntities.add(entityId);
			for (const f of model.fields) if (f.entityId === entityId) removedFields.add(f.id);
			lines.push(`Removed table "${model.entities.find((e) => e.id === entityId)?.name ?? entityId}"`);
			continue;
		}
		// A new table without a key gets one: an id, the way the Data model reads a table.
		if (d.kind === 'add' && !d.addFields.some((f) => f.name.toLowerCase() === 'id')) {
			out.model.fields.push({ id: `${entityId}-id`, entityId, name: 'id', type: 'uuid', isId: true, isRequired: true, isList: false, relationTargetEntityId: null });
		}
		for (const f of d.addFields) {
			out.model.fields.push({ id: f.id, entityId, name: f.name, type: f.type, isRequired: f.required, isList: f.list, relationTargetEntityId: realId(f.relationTo) });
		}
		for (const id of d.removeFields) removedFields.add(id);
		changed.push(...d.changeFields.map((c) => ({ ...c, ...(c.relationTo !== undefined ? { relationTo: realId(c.relationTo) } : {}) })));
		if (d.kind === 'amend' && d.name.trim()) renamed.push({ id: entityId, name: d.name.trim() });
		const name = d.kind === 'add' ? d.name || 'New table' : (model.entities.find((e) => e.id === entityId)?.name ?? entityId);
		const parts = [
			d.addFields.length > 0 ? `${d.addFields.length} field${d.addFields.length === 1 ? '' : 's'} added` : '',
			d.changeFields.length > 0 ? `${d.changeFields.length} changed` : '',
			d.removeFields.length > 0 ? `${d.removeFields.length} removed` : ''
		].filter(Boolean);
		lines.push(`${d.kind === 'add' ? 'Created' : 'Amended'} table "${name}"${parts.length ? ` (${parts.join(', ')})` : ''}`);
	}
	// A relation pointing at a removed table goes with it.
	for (const f of model.fields) if (f.relationTargetEntityId && removedEntities.has(f.relationTargetEntityId)) removedFields.add(f.id);
	return { ...out, removedEntityIds: [...removedEntities], removedFieldIds: [...removedFields], changedFields: changed, renamed, lines };
}

/* ----------------------------------------------------------------- report */

/**
 * The data changes as lines of the implementation report (ac-evo-impl-data):
 * one per table the request adds, amends or removes, to build until a person
 * validates it, because the implementation index does not locate a table yet.
 * The id is stable per table change, so a rebuild keeps the decision taken.
 */
export function dataReportLines(
	drafts: readonly DataDraft[],
	at: { readonly iteration: number; readonly specVersion: number },
	tableName: (id: string) => string
): {
	id: string;
	iteration: number;
	verdict: 'missing';
	requirement: string;
	filePath: string;
	lineRange: string;
	specStatement: string;
	codeStatement: string;
	hasRequirementAnchor: boolean;
	anchorForeignLeaf: boolean;
	acceptanceTestPassing: boolean;
	specVersion: number;
	scope: 'request';
	decision: 'undecided';
	decidedBy: null;
	decidedAt: null;
}[] {
	return drafts
		.filter((d) => d.materialisedAt === null)
		.map((d) => {
			const name = d.kind === 'add' ? d.name || 'New table' : d.name || (d.entityId ? tableName(d.entityId) : 'a table');
			const what =
				d.kind === 'add'
					? `adds table "${name}"${d.addFields.length ? ` (${d.addFields.map((f) => f.name).join(', ')})` : ''}`
					: d.kind === 'remove'
						? `removes table "${name}"`
						: `amends table "${name}"${[
								d.addFields.length ? `adds ${d.addFields.map((f) => f.name).join(', ')}` : '',
								d.changeFields.length ? `changes ${d.changeFields.length} field${d.changeFields.length === 1 ? '' : 's'}` : '',
								d.removeFields.length ? `removes ${d.removeFields.length} field${d.removeFields.length === 1 ? '' : 's'}` : ''
							]
								.filter(Boolean)
								.map((p, i) => (i === 0 ? `: ${p}` : `, ${p}`))
								.join('')}`;
			return {
				id: `data-line:${d.id}`,
				iteration: at.iteration,
				verdict: 'missing' as const,
				requirement: `Data change: ${what}`,
				filePath: '',
				lineRange: '',
				specStatement: `The data model ${what}.`,
				codeStatement: 'No code is located for a table yet: validate the line once the code holds it.',
				hasRequirementAnchor: true,
				anchorForeignLeaf: false,
				acceptanceTestPassing: false,
				specVersion: at.specVersion,
				scope: 'request' as const,
				decision: 'undecided' as const,
				decidedBy: null,
				decidedAt: null
			};
		});
}
