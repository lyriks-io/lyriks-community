import { describe, expect, it } from 'vitest';
import {
	createDatabase,
	createEmptyDataDraft,
	createEntity,
	createField,
	createHost,
	type ProjectDataDraft
} from '$domain/data';
import { layoutMap, relationEdges } from './data-map';
import { CLEARANCE, STUB, routeLines, type Box } from './erd-route';

/** One database: a hub every table points at, a chain under it, a loop and a table related to none. */
function schema(children = 3): ProjectDataDraft {
	const d = createEmptyDataDraft('p');
	d.hosts.push(createHost({ id: 'h1', name: 'API', kind: 'cloud' }));
	d.databases.push(createDatabase('h1', { id: 'db', name: 'main', engine: 'postgres' }));
	const table = (id: string) => {
		d.entities.push(createEntity({ id, name: id, databaseId: 'db' }));
		d.fields.push(createField(id, { id: `${id}-id`, name: 'id', isId: true }), createField(id, { id: `${id}-name`, name: 'name' }));
	};
	const fk = (from: string, to: string, required = true) =>
		d.fields.push(createField(from, { id: `${from}-${to}`, name: to, type: 'relation', relationTargetEntityId: to, isRequired: required }));
	table('project');
	for (let i = 0; i < children; i++) {
		table(`child${i}`);
		fk(`child${i}`, 'project');
	}
	table('visit');
	fk('visit', 'child0', false);
	table('a');
	table('b');
	fk('a', 'b');
	fk('b', 'a');
	fk('a', 'project');
	table('lonely');
	return d;
}

const all = (d: ProjectDataDraft) => new Set(d.entities.map((e) => e.id));

describe('tables sit in columns and relation lines run at right angles around them [criterion:c1f51729]', () => {
	it('puts every table in a column right of the tables it points at, loops included', () => {
		const d = schema();
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		const t = (id: string) => layout.tables.get(id)!;
		for (const id of ['child0', 'child1', 'child2', 'a']) expect(t(id).x).toBeGreaterThan(t('project').x + t('project').w);
		expect(t('visit').x).toBeGreaterThan(t('child0').x + t('child0').w);
		// The loop a <-> b is broken once: both are placed, in different columns.
		expect(t('a').x).not.toBe(t('b').x);
	});

	it('wraps a column too tall to read into the next one', () => {
		const d = schema(14);
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		const columns = new Set(Array.from({ length: 14 }, (_, i) => layout.tables.get(`child${i}`)!.x));
		expect(columns.size).toBeGreaterThan(1);
	});

	it('places the tables related to none after the related ones', () => {
		const d = schema();
		const layout = layoutMap(d, all(d), { keepEmpty: true });
		const lonely = layout.tables.get('lonely')!;
		const related = [...layout.tables.values()].filter((c) => c !== lonely);
		const right = Math.max(...related.map((c) => c.x + c.w));
		const bottom = Math.max(...related.map((c) => c.y + c.h));
		expect(lonely.x >= right || lonely.y >= bottom).toBe(true);
	});

	it('routes around a card standing between two others', () => {
		const boxes: Box[] = [
			{ x: 0, y: 0, w: 100, h: 60 },
			{ x: 200, y: 0, w: 100, h: 60 },
			{ x: 400, y: 0, w: 100, h: 60 }
		];
		const route = routeLines(boxes, [{ id: 'x', bundle: 'x', options: [{ from: { x: 400, y: 30, out: -1 }, to: { x: 100, y: 30, out: 1 } }] }], []).get('x')!;
		expect(route.points.length).toBeGreaterThan(2);
		const ys = route.points.map((p) => p.y);
		expect(Math.min(...ys) <= -CLEARANCE || Math.max(...ys) >= 60 + CLEARANCE).toBe(true);
		expect(STUB).toBeGreaterThan(26);
	});

	it('lays out and routes the same model the same way every time', () => {
		const d = schema(6);
		const a = relationEdges(d, layoutMap(d, all(d), { keepEmpty: true }));
		const b = relationEdges(d, layoutMap(d, all(d), { keepEmpty: true }));
		expect(b).toEqual(a);
	});
});
