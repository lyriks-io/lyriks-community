import { describe, expect, it } from 'vitest';
import {
	createDatabase,
	createEmptyDataDraft,
	createEntity,
	createField,
	createHost,
	type ProjectDataDraft
} from '$domain/data';
import { RING_R, endMarks, relationEnds } from './crows-foot';
import { layoutMap, relationEdges } from './data-map';

describe("each relation line reads its cardinality at both ends in crow's foot notation [criterion:584cb5f6]", () => {
	it('reads a foreign key as zero or many at its table, one or zero or one at the table it points at', () => {
		expect(relationEnds({ isList: false, isRequired: true })).toEqual({ from: { min: 0, many: true }, to: { min: 1, many: false } });
		expect(relationEnds({ isList: false, isRequired: false })).toEqual({ from: { min: 0, many: true }, to: { min: 0, many: false } });
	});

	it('reads a list as one at its table, zero or many (one or many when required) at the table it lists', () => {
		expect(relationEnds({ isList: true, isRequired: false })).toEqual({ from: { min: 1, many: false }, to: { min: 0, many: true } });
		expect(relationEnds({ isList: true, isRequired: true })).toEqual({ from: { min: 1, many: false }, to: { min: 1, many: true } });
	});

	it('puts the most against the table and the least beyond it', () => {
		const port = { x: 100, y: 50, out: 1 as const };
		// Many: the crow's foot's toes touch the card edge; zero: a ring beyond the foot.
		const many = endMarks(port, { min: 0, many: true });
		expect(many.d).toContain('L 100 42');
		expect(many.d).toContain('L 100 58');
		expect(many.ring!.x - RING_R).toBeGreaterThan(100 + 15);
		// Exactly one: two bars, no ring; zero or one: a bar, then a ring.
		const one = endMarks(port, { min: 1, many: false });
		expect(one.ring).toBeNull();
		expect(one.d.match(/M /g)).toHaveLength(2);
		const optional = endMarks(port, { min: 0, many: false });
		expect(optional.d.match(/M /g)).toHaveLength(1);
		expect(optional.ring!.x).toBeGreaterThan(108);
		// On a left edge the marks mirror.
		expect(endMarks({ ...port, out: -1 }, { min: 0, many: false }).ring!.x).toBeLessThan(100);
	});

	it('draws marks at both ends of every line, and gives ends of different kinds on one key their own lane', () => {
		const d: ProjectDataDraft = createEmptyDataDraft('p');
		d.hosts.push(createHost({ id: 'h1', name: 'API', kind: 'cloud' }));
	d.databases.push(createDatabase('h1', { id: 'db', name: 'main', engine: 'postgres' }));
		d.entities.push(
			createEntity({ id: 'customer', name: 'Customer', databaseId: 'db' }),
			createEntity({ id: 'order', name: 'Order', databaseId: 'db' }),
			createEntity({ id: 'note', name: 'Note', databaseId: 'db' })
		);
		d.fields.push(
			createField('customer', { id: 'c-id', name: 'id', isId: true }),
			createField('order', { id: 'o-id', name: 'id', isId: true }),
			createField('order', { id: 'o-customer', name: 'customer', type: 'relation', relationTargetEntityId: 'customer', isRequired: true }),
			createField('note', { id: 'n-id', name: 'id', isId: true }),
			createField('note', { id: 'n-customer', name: 'customer', type: 'relation', relationTargetEntityId: 'customer' })
		);
		const edges = relationEdges(d, layoutMap(d, new Set(['customer', 'order', 'note']), { keepEmpty: true }));
		expect(edges).toHaveLength(2);
		const required = edges.find((e) => e.id === 'o-customer')!;
		const optional = edges.find((e) => e.id === 'n-customer')!;
		// The FK end: a ring and a foot; the required target: two bars; the optional one: a bar and a ring.
		expect(required.rings).toHaveLength(1);
		expect(optional.rings).toHaveLength(2);
		const landing = (path: string) => Number(path.trim().split(/\s+/).at(-1));
		expect(landing(required.d)).not.toBe(landing(optional.d));
	});
});
