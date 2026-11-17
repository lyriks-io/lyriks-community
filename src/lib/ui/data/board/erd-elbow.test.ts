import { describe, expect, it } from 'vitest';
import { createDatabase, createEmptyDataDraft, createEntity, createField, createHost, type ProjectDataDraft } from '$domain/data';
import { layoutMap, placementOf, relationEdges, rowCenterY, type MapLayout } from './data-map';
import { ELBOW_STUB, elbowRoutes, type ElbowAsk } from './erd-elbow';

/** One database: a hub most tables point at, a chain under it, a loop and a table related to none. */
function schema(): ProjectDataDraft {
	const d = createEmptyDataDraft('p');
	d.hosts.push(createHost({ id: 'h1', name: 'API', kind: 'cloud' }));
	d.databases.push(createDatabase('h1', { id: 'db', name: 'main', engine: 'postgres' }));
	const table = (id: string) => {
		d.entities.push(createEntity({ id, name: id, databaseId: 'db' }));
		d.fields.push(createField(id, { id: `${id}-id`, name: 'id', isId: true }), createField(id, { id: `${id}-name`, name: 'name' }));
	};
	const fk = (from: string, to: string) =>
		d.fields.push(createField(from, { id: `${from}-${to}`, name: to, type: 'relation', relationTargetEntityId: to, isRequired: true }));
	table('project');
	for (let i = 0; i < 6; i++) {
		table(`child${i}`);
		fk(`child${i}`, 'project');
	}
	table('visit');
	fk('visit', 'child0');
	table('a');
	table('b');
	fk('a', 'b');
	fk('b', 'a');
	fk('a', 'project');
	return d;
}

/** The asks relationEdges makes, one per relation field. */
function asksOf(d: ProjectDataDraft, layout: MapLayout): ElbowAsk[] {
	return d.fields
		.filter((f) => f.type === 'relation')
		.map((f) => {
			const a = layout.tables.get(f.entityId)!;
			const b = layout.tables.get(f.relationTargetEntityId!)!;
			return { id: f.id, bundle: b.id, from: { box: a, y: rowCenterY(a, f.id) }, to: { box: b, y: rowCenterY(b, `${b.id}-id`) } };
		});
}

describe('each relation line turns twice at most, at right angles [criterion:c1f51729]', () => {
	const d = schema();
	const layout = layoutMap(d, new Set(d.entities.map((e) => e.id)), { keepEmpty: true });
	const routes = elbowRoutes(asksOf(d, layout));

	it('leaves its row and lands on the key row horizontally, with two bends at most and a straight run at each end', () => {
		for (const ask of asksOf(d, layout)) {
			const p = routes.get(ask.id)!.points;
			expect(p.length === 2 || p.length === 4).toBe(true);
			expect(p[0].y).toBe(ask.from.y);
			expect(p.at(-1)!.y).toBe(ask.to.y);
			for (let k = 0; k < p.length - 1; k++) expect(p[k].x === p[k + 1].x || p[k].y === p[k + 1].y).toBe(true);
			if (p.length === 4) {
				expect(p[0].y).toBe(p[1].y);
				expect(p[2].y).toBe(p[3].y);
				expect(Math.abs(p[1].x - p[0].x)).toBeGreaterThanOrEqual(26);
				expect(Math.abs(p[3].x - p[2].x)).toBeGreaterThanOrEqual(26);
			}
		}
	});

	it('leaves on the side facing the table it points at, the run in the gap beside that table', () => {
		const child = layout.tables.get('child0')!;
		const project = layout.tables.get('project')!;
		expect(project.x + project.w).toBeLessThan(child.x);
		const p = routes.get('child0-project')!.points;
		expect(p[0].x).toBe(child.x);
		expect(p.at(-1)!.x).toBe(project.x + project.w);
		if (p.length === 4) expect(p[1].x).toBe(project.x + project.w + ELBOW_STUB);
	});

	it('keeps the lines landing on one key on one trunk, and spreads the runs of different keys in one gap', () => {
		const runs = (ids: string[]) => ids.map((id) => routes.get(id)!.points).filter((p) => p.length === 4).map((p) => p[1].x);
		const toProject = runs(['child0-project', 'child1-project', 'child2-project', 'child3-project']);
		expect(new Set(toProject).size).toBe(1);
		const toChild0 = runs(['visit-child0']);
		if (toChild0.length && layout.tables.get('child0')!.x + layout.tables.get('child0')!.w === layout.tables.get('project')!.x + layout.tables.get('project')!.w)
			expect(toChild0[0]).not.toBe(toProject[0]);
	});

	it('runs straight between level rows, and joins two cards of one column around a run on their right', () => {
		const box = { x: 0, y: 0, w: 100, h: 200 };
		const straight = elbowRoutes([{ id: 's', bundle: 'k', from: { box: { ...box, x: 300 }, y: 40 }, to: { box, y: 40 } }]).get('s')!;
		expect(straight.points).toHaveLength(2);
		const stacked = elbowRoutes([{ id: 'c', bundle: 'k', from: { box: { ...box, y: 300 }, y: 340 }, to: { box, y: 40 } }]).get('c')!;
		expect(stacked.from.out).toBe(1);
		expect(stacked.to.out).toBe(1);
		expect(stacked.points.map((p) => p.x)).toEqual([100, 100 + ELBOW_STUB, 100 + ELBOW_STUB, 100]);
	});

	it('gives each key landing in one gap its own run', () => {
		const left = { x: 0, y: 0, w: 100, h: 400 };
		const right = { x: 400, y: 0, w: 100, h: 400 };
		const r = elbowRoutes([
			{ id: 'x', bundle: 'k1', from: { box: right, y: 300 }, to: { box: left, y: 40 } },
			{ id: 'y', bundle: 'k2', from: { box: right, y: 350 }, to: { box: left, y: 120 } },
			{ id: 'z', bundle: 'k1', from: { box: right, y: 200 }, to: { box: left, y: 40 } }
		]);
		const run = (id: string) => r.get(id)!.points[1].x;
		expect(run('x')).toBe(run('z'));
		expect(run('y')).not.toBe(run('x'));
		expect(run('y')).toBeLessThanOrEqual(400 - 30);
	});

	it('lays out and routes the same model the same way every time', () => {
		expect(relationEdges(d, layoutMap(d, new Set(d.entities.map((e) => e.id)), { keepEmpty: true }))).toEqual(relationEdges(d, layout));
	});
});

describe('a table put by hand stands where it was put [criterion:7f5769bb]', () => {
	const d = schema();
	const ids = new Set(d.entities.map((e) => e.id));
	const auto = layoutMap(d, ids, { keepEmpty: true });

	it('places a moved table there, the database growing to hold it, the others where the layout places them', () => {
		const moved = layoutMap(d, ids, { keepEmpty: true, placements: { tables: { visit: { x: 2000, y: 40 } } } });
		expect(placementOf(moved, 'visit')).toEqual({ x: 2000, y: 40 });
		expect(placementOf(moved, 'project')).toEqual(placementOf(auto, 'project'));
		const db = (l: MapLayout) => l.hosts[0].databases[0];
		expect(db(moved).w).toBeGreaterThan(db(auto).w);
		expect(db(moved).w).toBeGreaterThanOrEqual(2000 + moved.tables.get('visit')!.w);
	});

	it("draws the moved table's lines from where it stands", () => {
		const moved = layoutMap(d, ids, { keepEmpty: true, placements: { tables: { visit: { x: 2000, y: 40 } } } });
		const visit = moved.tables.get('visit')!;
		const line = relationEdges(d, moved).find((e) => e.id === 'visit-child0')!;
		expect(line.d.startsWith(`M ${visit.x} `)).toBe(true);
	});
});
