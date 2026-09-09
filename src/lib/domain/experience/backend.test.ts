import { describe, it, expect } from 'vitest';
import {
	coerceBackend,
	createBackendCollection,
	createBackendField,
	generateRows,
	primaryFields
} from './backend';
import type { BackendField } from './backend';

const f = (name: string, kind: BackendField['kind']) => createBackendField({ name, kind });

describe('primaryFields', () => {
	it('skips id/relation columns in favor of a label-worthy field', () => {
		// Mirrors an imported Alert entity: id + relation ids come first.
		const col = createBackendCollection({
			name: 'Alert',
			fields: [
				f('id', 'id'),
				f('workspace', 'id'),
				f('zap', 'id'),
				f('kind', 'category'),
				f('message', 'sentence'),
				f('acknowledged', 'boolean'),
				f('createdAt', 'date')
			]
		});
		const [primary, secondary] = primaryFields(col);
		expect(primary.name).toBe('message');
		expect(secondary.name).toBe('kind');
	});

	it('prefers a name-like field as primary and a different-kind qualifier as secondary', () => {
		const col = createBackendCollection({
			name: 'Zap',
			fields: [
				f('id', 'id'),
				f('workspace', 'id'),
				f('name', 'fullName'),
				f('status', 'status'),
				f('stepCount', 'number')
			]
		});
		const [primary, secondary] = primaryFields(col);
		expect(primary.name).toBe('name');
		expect(secondary.name).toBe('status');
	});

	it('falls back to id fields when nothing better exists', () => {
		const col = createBackendCollection({
			name: 'Link',
			fields: [f('id', 'id'), f('source', 'id'), f('target', 'id')]
		});
		const picked = primaryFields(col);
		expect(picked).toHaveLength(2);
		expect(picked[0].name).toBe('id');
	});

	it('keeps collections of one or two fields untouched', () => {
		const col = createBackendCollection({
			name: 'Folder',
			fields: [f('id', 'id'), f('name', 'fullName')]
		});
		expect(primaryFields(col).map((x) => x.name)).toEqual(['id', 'name']);
	});
});

describe('authored rows', () => {
	it('seeds exactly the authored rows, gap-filling missing fields', () => {
		const col = createBackendCollection({
			name: 'Plan',
			fields: [f('name', 'fullName'), f('price', 'price'), f('quota', 'number')],
			seedCount: 5,
			rows: [
				{ name: 'Free', price: 0 },
				{ name: 'Pro', price: 49 }
			]
		});
		const rows = generateRows(col);
		expect(rows).toHaveLength(2); // authored rows win over seedCount
		expect(rows[0].name).toBe('Free');
		expect(rows[0].price).toBe(0); // correlated values survive
		expect(rows[0].quota).not.toBeUndefined(); // gap-filled from the generator
	});

	it('coerceBackend round-trips authored rows and drops non-object entries', () => {
		const [col] = coerceBackend([
			{
				id: 'c1',
				name: 'Plan',
				fields: [{ id: 'f1', name: 'name', kind: 'fullName' }],
				seedCount: 5,
				rows: [{ name: 'Free' }, 'garbage', null]
			}
		]);
		expect(col.rows).toEqual([{ name: 'Free' }]);
	});

	it('omits rows entirely when the input has none', () => {
		const [col] = coerceBackend([
			{ id: 'c1', name: 'Plan', fields: [], seedCount: 5 }
		]);
		expect('rows' in col).toBe(false);
	});

	it('coerceBackend keeps string provenance and drops anything else', () => {
		const [linked, handmade, bogus] = coerceBackend([
			{ id: 'c1', name: 'Plan', fields: [], seedCount: 5, sourceEntityId: 'entity-1' },
			{ id: 'c2', name: 'Note', fields: [], seedCount: 5 },
			{ id: 'c3', name: 'Junk', fields: [], seedCount: 5, sourceEntityId: 42 }
		]);
		expect(linked.sourceEntityId).toBe('entity-1');
		expect('sourceEntityId' in handmade).toBe(false);
		expect('sourceEntityId' in bogus).toBe(false);
	});
});
