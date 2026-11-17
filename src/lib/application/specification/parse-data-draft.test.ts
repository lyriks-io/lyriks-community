import { describe, expect, it } from 'vitest';
import { parseDataDraft } from './parse-data-draft';

describe('a table keeps the sources it cites through every write [criterion:3918b2ea]', () => {
	const table = (extra: Record<string, unknown>) => parseDataDraft({ entities: [{ id: 'users', name: 'Users', ...extra }] }, 'p1').entities[0];

	it('keeps each register row a table cites, once', () => {
		expect(table({ sourceIds: ['src-model-user', 'src-migration', 'src-model-user'] }).sourceIds).toEqual(['src-model-user', 'src-migration']);
	});

	it('carries no citation for a table that cites nothing, or cites in a shape it cannot read', () => {
		expect(table({}).sourceIds).toBeUndefined();
		expect(table({ sourceIds: [] }).sourceIds).toBeUndefined();
		expect(table({ sourceIds: 'src-model-user' }).sourceIds).toBeUndefined();
		expect(table({ sourceIds: ['', 42, 'src-ok'] }).sourceIds).toEqual(['src-ok']);
	});
});

describe('a relation says what deleting the record it points at does [criterion:99e7cc77]', () => {
	const field = (extra: Record<string, unknown>) =>
		parseDataDraft({ fields: [{ id: 'f1', entityId: 'bookmark', name: 'owner', type: 'relation', relationTargetEntityId: 'user', ...extra }] }, 'p1').fields[0];

	it('keeps cascade, set_null and restrict on a relation', () => {
		expect(field({ onDelete: 'cascade' }).onDelete).toBe('cascade');
		expect(field({ onDelete: 'set_null' }).onDelete).toBe('set_null');
		expect(field({ onDelete: 'restrict' }).onDelete).toBe('restrict');
	});

	it('reads not stated for an unknown value, a scalar field, or set_null on a required link', () => {
		expect(field({ onDelete: 'nuke' }).onDelete).toBeUndefined();
		expect(field({ type: 'string', onDelete: 'cascade' }).onDelete).toBeUndefined();
		expect(field({ isRequired: true, onDelete: 'set_null' }).onDelete).toBeUndefined();
		expect(field({}).onDelete).toBeUndefined();
	});
});
