import { describe, it, expect } from 'vitest';
import { createEmptyDataDraft, createEntity, createField, createDatabase } from './draft';
import { toErDiagram } from './mermaid';

function draftWith(build: (d: ReturnType<typeof createEmptyDataDraft>) => void) {
	const d = createEmptyDataDraft('p1');
	build(d);
	return d;
}

describe('toErDiagram', () => {
	it('notes the empty model', () => {
		expect(toErDiagram(createEmptyDataDraft('p1'))).toContain('No table yet');
	});

	it('emits an entity block with PK/FK/UK annotations', () => {
		const d = draftWith((d) => {
			const e = createEntity({ name: 'User' });
			d.entities.push(e);
			d.fields.push(createField(e.id, { name: 'id', type: 'uuid', isId: true }));
			d.fields.push(createField(e.id, { name: 'email', type: 'string', isUnique: true }));
		});
		const out = toErDiagram(d);
		expect(out).toContain('User {');
		expect(out).toContain('uuid id PK');
		expect(out).toContain('string email UK');
	});

	it('renders one-to-many for a list relation and many-to-one for a required one', () => {
		const d = draftWith((d) => {
			const user = createEntity({ name: 'User' });
			const order = createEntity({ name: 'Order' });
			d.entities.push(user, order);
			// User has many Orders (list relation)
			d.fields.push(
				createField(user.id, {
					name: 'orders',
					type: 'relation',
					isList: true,
					relationTargetEntityId: order.id
				})
			);
			// Order belongs to exactly one User (required relation)
			d.fields.push(
				createField(order.id, {
					name: 'owner',
					type: 'relation',
					isRequired: true,
					relationTargetEntityId: user.id
				})
			);
		});
		const out = toErDiagram(d);
		expect(out).toContain('User ||--o{ Order : orders');
		expect(out).toContain('Order }o--|| User : owner');
	});

	it('sanitizes names with spaces and dedupes entity tokens', () => {
		const d = draftWith((d) => {
			d.entities.push(createEntity({ name: 'Order Line' }));
			d.entities.push(createEntity({ name: 'Order Line' }));
		});
		const out = toErDiagram(d);
		expect(out).toContain('Order_Line {');
		expect(out).toContain('Order_Line_2 {');
	});

	it('skips relations whose target no longer exists', () => {
		const d = draftWith((d) => {
			const e = createEntity({ name: 'Ghost' });
			d.entities.push(e);
			d.databases.push(createDatabase('h1'));
			d.fields.push(
				createField(e.id, { name: 'gone', type: 'relation', relationTargetEntityId: 'missing' })
			);
		});
		const out = toErDiagram(d);
		expect(out).not.toContain('--');
	});
});
