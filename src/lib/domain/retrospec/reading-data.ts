import { DB_ENGINES, HOST_KINDS, unrelatedEntities } from '../data';
import type { DataMapLayout, DataTable, RetroItem, RetrospecSpec } from './reading';
import { clean, firstSentence, label, plural } from './reading-text';

/**
 * The Data of the review: the data map (each host, its databases, their tables
 * with keys and relations), the tables related to nothing, the interfaces. Pure.
 */

/** A field that points at another table, the way the data model's own checks read one. */
export const isRelation = (f: { type: string; relationTargetEntityId: string | null }) => f.type === 'relation' && !!f.relationTargetEntityId;

export function dataLayout(spec: RetrospecSpec): { map: DataMapLayout; items: Omit<RetroItem, 'ref'>[] } {
	const d = spec.data;
	const entityName = new Map(d.entities.map((e) => [e.id, clean(e.name) || e.id]));
	const table = (entityId: string): DataTable => ({
		id: entityId,
		name: entityName.get(entityId) ?? entityId,
		rows: d.fields
			.filter((f) => f.entityId === entityId && !f.parentFieldId)
			.map((f) => ({
				key: f.isId ? 'PK' : isRelation(f) ? 'FK' : '',
				name: clean(f.name),
				type: isRelation(f) ? `→ ${entityName.get(f.relationTargetEntityId!) ?? f.relationTargetEntityId}` : String(f.type)
			}))
	});
	const filed = new Set<string>();
	const hosts = d.hosts.map((h) => ({
		id: h.id,
		name: clean(h.name) || h.id,
		kind: label(HOST_KINDS, h.kind),
		where: [clean(h.provider), clean(h.region)].filter(Boolean).join(' · '),
		databases: d.databases
			.filter((db) => db.hostId === h.id)
			.map((db) => {
				const tables = d.entities.filter((e) => e.databaseId === db.id).map((e) => {
					filed.add(e.id);
					return table(e.id);
				});
				return { id: db.id, name: clean(db.name) || db.id, engine: label(DB_ENGINES, db.engine), tables };
			})
	}));
	const loose = d.entities.filter((e) => !filed.has(e.id)).map((e) => table(e.id));
	const map: DataMapLayout = { hosts, loose, tableCount: d.entities.length };
	const items: Omit<RetroItem, 'ref'>[] = [];
	const relations = d.fields.filter(isRelation).length;
	if (d.entities.length > 0) {
		items.push({ id: 'data:datamap', tab: 'data', title: 'Datamap', desc: `We rebuilt ${plural(d.entities.length, 'entity', 'entities')} and ${plural(relations, 'relation')}.`, rejectable: false, datamap: true });
	}
	const orphans = unrelatedEntities(d);
	if (orphans.length > 0) {
		items.push({ id: 'data:orphans', tab: 'data', title: 'Unrelated tables', desc: 'These tables point at nothing and nothing points at them: unused, or a relation the code hides.', chips: orphans.map((e) => clean(e.name) || e.id), rejectable: false });
	}
	const interfaces = d.interfaces.filter((i) => clean(i.operation) || clean(i.description));
	if (interfaces.length > 0) {
		items.push({ id: 'data:interfaces', tab: 'data', title: 'Interfaces', desc: `${plural(interfaces.length, 'exchange')} between the parts of the product.`, chips: interfaces.map((i) => clean(i.operation) || firstSentence(i.description, 60)), rejectable: false });
	}
	return { map, items };
}
