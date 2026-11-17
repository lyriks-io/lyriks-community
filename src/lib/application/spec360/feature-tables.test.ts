import { describe, expect, it } from 'vitest';
import type { DataEntity, EntityField } from '$domain/data';
import { featureTables } from './feature-tables';

const entity = (id: string, name: string) => ({ id, name }) as DataEntity;
const field = (id: string, entityId: string, name: string, type: EntityField['type'], extra: Partial<EntityField> = {}) =>
	({ id, entityId, name, type, relationTargetEntityId: null, parentFieldId: null, ...extra }) as EntityField;

describe("a feature's Data reads its tables and their fields [criterion:c72a7e79]", () => {
	const draft = {
		entities: [entity('call', 'Call'), entity('chat', 'Chat'), entity('att', 'attachment')],
		fields: [
			field('c1', 'call', 'chat', 'relation', { relationTargetEntityId: 'chat' }),
			field('c2', 'call', 'status', 'enum'),
			field('c3', 'call', 'meta', 'object'),
			field('c4', 'call', 'codec', 'string', { parentFieldId: 'c3' }),
			field('a1', 'att', 'size', 'int'),
			field('h1', 'chat', 'title', 'string')
		]
	};

	it('lists the tables from A to Z, each field in its declared order, a foreign key naming its table', () => {
		const tables = featureTables(draft, ['call', 'att', 'missing', 'call']);
		expect(tables.map((t) => t.name)).toEqual(['attachment', 'Call']);
		expect(tables[1].fields).toEqual([
			{ id: 'c1', name: 'chat', target: 'Chat', type: 'Relation' },
			{ id: 'c2', name: 'status', target: null, type: 'Enum' },
			{ id: 'c3', name: 'meta', target: null, type: 'Object' },
			{ id: 'c4', name: 'meta.codec', target: null, type: 'String' }
		]);
	});

	it('reads nothing when the feature uses no table', () => {
		expect(featureTables(draft, [])).toEqual([]);
	});
});
