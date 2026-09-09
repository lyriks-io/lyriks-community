import { describe, it, expect } from 'vitest';
import { createEntity, createField } from '$domain/data';
import {
	fieldTypeToFakeKind,
	entityToCollection,
	sourceEntityOf,
	collectionInSync,
	syncEntityIntoCollections,
	type BackendCollection
} from '$domain/experience';

describe('Step 07 → simulator data bridge', () => {
	it('maps field types (and refines strings/decimals by name) to fake-data kinds', () => {
		expect(fieldTypeToFakeKind({ name: 'Email', type: 'string' })).toBe('email');
		expect(fieldTypeToFakeKind({ name: 'Full Name', type: 'string' })).toBe('fullName');
		expect(fieldTypeToFakeKind({ name: 'City', type: 'string' })).toBe('city');
		expect(fieldTypeToFakeKind({ name: 'Notes', type: 'string' })).toBe('sentence');
		expect(fieldTypeToFakeKind({ name: 'Amount', type: 'decimal' })).toBe('price');
		expect(fieldTypeToFakeKind({ name: 'Ratio', type: 'decimal' })).toBe('number');
		expect(fieldTypeToFakeKind({ name: 'Count', type: 'int' })).toBe('number');
		expect(fieldTypeToFakeKind({ name: 'Active', type: 'boolean' })).toBe('boolean');
		expect(fieldTypeToFakeKind({ name: 'Created', type: 'datetime' })).toBe('date');
		expect(fieldTypeToFakeKind({ name: 'Ref', type: 'uuid' })).toBe('id');
		expect(fieldTypeToFakeKind({ name: 'Status', type: 'enum' })).toBe('status');
	});

	it('builds an editable collection from an entity and its owned fields', () => {
		const entity = createEntity({ name: 'Expense' });
		const other = createEntity({ name: 'User' });
		const fields = [
			createField(entity.id, { name: 'Id', type: 'uuid', isId: true }),
			createField(entity.id, { name: 'Amount', type: 'decimal' }),
			createField(entity.id, { name: '' }), // unnamed → skipped
			createField(other.id, { name: 'Email', type: 'string' }) // different entity → skipped
		];

		const col = entityToCollection(entity, fields);
		expect(col.name).toBe('Expense');
		expect(col.seedCount).toBe(5);
		expect(col.fields.map((f) => f.name)).toEqual(['Id', 'Amount']);
		// id-flagged field maps to the id kind regardless of declared type
		expect(col.fields[0].kind).toBe('id');
		expect(col.fields[1].kind).toBe('price');
	});

	it('falls back to a single field for an entity with no usable fields', () => {
		const entity = createEntity({ name: 'Empty' });
		const col = entityToCollection(entity, []);
		expect(col.fields).toHaveLength(1);
		expect(col.name).toBe('Empty');
	});

	it('stamps provenance and resolves it back, surviving an entity rename', () => {
		const entity = createEntity({ name: 'Expense' });
		const col = entityToCollection(entity, []);
		expect(col.sourceEntityId).toBe(entity.id);
		expect(sourceEntityOf(col, [entity])?.id).toBe(entity.id);
		// Entity renamed after import: provenance still finds it, name would not.
		const renamed = { ...entity, name: 'Spend' };
		expect(sourceEntityOf(col, [renamed])?.id).toBe(entity.id);
	});

	it('resolves legacy pre-provenance collections by case-insensitive name', () => {
		const entity = createEntity({ name: 'Invoice' });
		const legacy = { ...entityToCollection(entity, []), name: ' invoice' };
		delete legacy.sourceEntityId;
		expect(sourceEntityOf(legacy, [entity])?.id).toBe(entity.id);
		expect(sourceEntityOf({ ...legacy, name: 'Other' }, [entity])).toBeNull();
	});

	it('flags model drift but ignores author demo tweaks', () => {
		const entity = createEntity({ name: 'Expense' });
		const fields = [
			createField(entity.id, { name: 'Amount', type: 'decimal' }),
			createField(entity.id, { name: 'Status', type: 'enum', enumValues: ['Draft', 'Paid'] })
		];
		const col = entityToCollection(entity, fields);
		expect(collectionInSync(col, entity, fields)).toBe(true);

		// Seed count and authored rows are the author's knobs, never drift.
		const tweaked = { ...col, seedCount: 42, rows: [{ Amount: 1 }] };
		expect(collectionInSync(tweaked, entity, fields)).toBe(true);

		// A grown model, a changed enum pool, or a renamed entity all drift.
		const grown = [...fields, createField(entity.id, { name: 'Payee', type: 'string' })];
		expect(collectionInSync(col, entity, grown)).toBe(false);
		const repooled = [fields[0], { ...fields[1], enumValues: ['Draft', 'Paid', 'Void'] }];
		expect(collectionInSync(col, entity, repooled)).toBe(false);
		expect(collectionInSync(col, { ...entity, name: 'Spend' }, fields)).toBe(false);
	});

	it('sync helper imports, refreshes, and backfills provenance in place', () => {
		const entity = createEntity({ name: 'Expense' });
		const fields = [createField(entity.id, { name: 'Amount', type: 'decimal' })];
		const collections: BackendCollection[] = [];

		const first = syncEntityIntoCollections(collections, entity, fields);
		expect(first.outcome).toBe('imported');
		expect(collections).toHaveLength(1);

		// Author tweaks a demo knob, then the model grows a field: fields follow
		// the model on refresh, the knob stays.
		collections[0].seedCount = 30;
		const grown = [...fields, createField(entity.id, { name: 'Payee', type: 'string' })];
		const second = syncEntityIntoCollections(collections, entity, grown);
		expect(second.outcome).toBe('updated');
		expect(collections[0].fields.map((f) => f.name)).toEqual(['Amount', 'Payee']);
		expect(collections[0].seedCount).toBe(30);

		// In sync again: nothing to do, nothing mutated.
		const third = syncEntityIntoCollections(collections, entity, grown);
		expect(third.outcome).toBe('unchanged');
		expect(third.changed).toBe(false);

		// A legacy collection matched by name gets provenance backfilled silently.
		delete collections[0].sourceEntityId;
		const fourth = syncEntityIntoCollections(collections, entity, grown);
		expect(fourth.outcome).toBe('unchanged');
		expect(fourth.changed).toBe(true);
		expect(collections[0].sourceEntityId).toBe(entity.id);
	});
});
