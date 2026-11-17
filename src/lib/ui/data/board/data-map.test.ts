import { describe, expect, it } from 'vitest';
import {
	createDatabase,
	createEmptyDataDraft,
	createEntity,
	createField,
	createHost,
	type ProjectDataDraft
} from '$domain/data';
import {
	EMPTY_FILTER,
	fieldKeyOf,
	filterTables,
	layoutMap,
	relationEdges,
	rowCenterY,
	tableColor,
	VISIBILITY_HEX,
	visibilityAnomalies,
	visibilityStatus
} from './data-map';
import { ENGINE_HEX, HOST_TYPE_HEX } from '../infra-style';

/** A machine with one Postgres database holding Order -> Customer, plus one unplaced table. */
function fixture(): ProjectDataDraft {
	const d = createEmptyDataDraft('p');
	const host = createHost({ id: 'h1', name: 'API', kind: 'cloud' });
	const db = createDatabase('h1', { id: 'db1', name: 'main', engine: 'postgres' });
	const customer = createEntity({ id: 'customer', name: 'Customer', databaseId: 'db1' });
	const order = createEntity({
		id: 'order',
		name: 'Order',
		databaseId: 'db1',
		derivedFrom: 'journey'
	});
	const draft = createEntity({ id: 'draft', name: 'Draft', databaseId: null });
	d.hosts.push(host);
	d.databases.push(db);
	d.entities.push(customer, order, draft);
	d.fields.push(
		createField('customer', { id: 'c-id', name: 'id', type: 'uuid', isId: true }),
		createField('customer', { id: 'c-email', name: 'email', isUnique: true }),
		createField('order', { id: 'o-id', name: 'id', type: 'uuid', isId: true }),
		createField('order', {
			id: 'o-customer',
			name: 'customer',
			type: 'relation',
			relationTargetEntityId: 'customer',
			isRequired: true
		})
	);
	return d;
}

const all = (d: ProjectDataDraft) => new Set(d.entities.map((e) => e.id));

describe('data map layout', () => {
	it('groups tables inside their database and machine, and keeps unplaced tables in an honest group', () => {
		const d = fixture();
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		expect(layout.hosts.map((h) => h.id)).toEqual(['h1', '__none__']);
		const main = layout.hosts[0].databases[0];
		expect(main.tables.map((t) => t.id).sort()).toEqual(['customer', 'order']);
		const unplaced = layout.hosts[1].databases[0];
		expect(unplaced.id).toBe('__none__');
		expect(unplaced.tables.map((t) => t.id)).toEqual(['draft']);
		// Every table card sits inside its database block.
		for (const t of main.tables) {
			expect(t.x).toBeGreaterThanOrEqual(main.x);
			expect(t.y + t.h).toBeLessThanOrEqual(main.y + main.h);
		}
	});

	it('never lets two cards overlap, and lays the same model out the same way twice', () => {
		const d = fixture();
		const a = [...layoutMap(d, all(d), { keepEmpty: true }).tables.values()];
		for (let i = 0; i < a.length; i++)
			for (let j = i + 1; j < a.length; j++) {
				const p = a[i];
				const q = a[j];
				const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
				expect(apart).toBe(true);
			}
		const b = [...layoutMap(d, all(d), { keepEmpty: true }).tables.values()];
		expect(b.map((t) => [t.x, t.y])).toEqual(a.map((t) => [t.x, t.y]));
	});

	it('groups by origin on demand, each origin holding its own tables', () => {
		const d = fixture();
		const layout = layoutMap(d, all(d), { keepEmpty: true, groupBy: 'origin' });
		expect(layout.hosts.map((h) => h.origin)).toEqual(['journey', 'manual']);
		expect(layout.hosts[0].databases.flatMap((x) => x.tables.map((t) => t.id))).toEqual(['order']);
	});

	it('shrinks a card to its keys on demand', () => {
		const d = fixture();
		const layout = layoutMap(d, all(d), { keepEmpty: true, keysOnly: true });
		expect(layout.tables.get('customer')!.fieldIds).toEqual(['c-id', 'c-email']);
	});

	it('drops empty groups while a filter is active', () => {
		const d = fixture();
		const layout = layoutMap(d, new Set(['draft']), { keepEmpty: false });
		expect(layout.hosts.map((h) => h.id)).toEqual(['__none__']);
	});

	it('draws a relation from the FK row of its table to the key row of the target table', () => {
		const d = fixture();
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		const edges = relationEdges(d, layout);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ fromEntityId: 'order', toEntityId: 'customer' });
		const order = layout.tables.get('order')!;
		const customer = layout.tables.get('customer')!;
		expect(edges[0].d.startsWith(`M ${order.x} ${rowCenterY(order, 'o-customer')}`)).toBe(true);
		expect(edges[0].d.endsWith(`L ${customer.x + customer.w} ${rowCenterY(customer, 'c-id')}`)).toBe(true);
	});

	it('routes the links of a table in hand on its moving place, from its own relations alone [criterion:d5c8782c]', () => {
		const d = fixture();
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		const order = layout.tables.get('order')!;
		const tables = new Map(layout.tables);
		tables.set('order', { ...order, x: order.x + 40, y: order.y + 25 });
		const touching = new Set(d.fields.filter((f) => f.type === 'relation' && (f.entityId === 'order' || f.relationTargetEntityId === 'order')).map((f) => f.id));
		const moved = relationEdges({ ...d, fields: d.fields.filter((f) => f.type !== 'relation' || touching.has(f.id)) }, { ...layout, tables });
		expect(moved).toHaveLength(1);
		expect(moved[0].d.startsWith(`M ${order.x + 40} ${rowCenterY(order, 'o-customer') + 25}`)).toBe(true);
	});
});

describe('data map keys, lenses and filters', () => {
	it('reads one key per field, PK first', () => {
		const d = fixture();
		const key = (id: string) => fieldKeyOf(d.fields.find((f) => f.id === id)!);
		expect(key('c-id')).toBe('primary');
		expect(key('c-email')).toBe('unique');
		expect(key('o-customer')).toBe('foreign');
	});

	it('colors a table by its database engine, its machine kind, or its visibility', () => {
		const d = fixture();
		const ctx = { draft: d, derived: new Set(['order']) };
		const order = d.entities.find((e) => e.id === 'order')!;
		expect(tableColor('database', ctx, order)).toBe(ENGINE_HEX.postgres);
		expect(tableColor('host', ctx, order)).toBe(HOST_TYPE_HEX.cloud);
		expect(tableColor('visibility', ctx, order)).toBe(VISIBILITY_HEX.visible);
	});

	it('finds a table by the type of one of its fields, and marks that field', () => {
		const d = fixture();
		const ctx = { draft: d, derived: new Set<string>() };
		const r = filterTables(ctx, { ...EMPTY_FILTER, query: 'uuid' });
		expect([...r.entityIds].sort()).toEqual(['customer', 'order']);
		expect(r.matchedFieldIds.has('o-id')).toBe(true);
	});

	it('narrows by origin and by machine', () => {
		const d = fixture();
		const ctx = { draft: d, derived: new Set<string>() };
		expect([...filterTables(ctx, { ...EMPTY_FILTER, origin: 'journey' }).entityIds]).toEqual(['order']);
		expect([...filterTables(ctx, { ...EMPTY_FILTER, hostId: '__none__' }).entityIds]).toEqual(['draft']);
	});
});

describe('client visibility on the map', () => {
	it('follows the experience unless a person forced it, and flags what left silently', () => {
		const d = fixture();
		d.visibility = { 'c-email': 'hidden', draft: 'shown' };
		const derived = new Set(['customer', 'c-id', 'order', 'o-id', 'o-customer']);
		expect(visibilityStatus(d, derived, 'c-email')).toBe('hidden');
		expect(visibilityStatus(d, derived, 'draft')).toBe('visible');
		expect(visibilityAnomalies(d, derived)).toEqual([]);

		delete d.visibility['c-email'];
		expect(visibilityAnomalies(d, derived).map((a) => a.id)).toEqual(['c-email']);
	});
});
