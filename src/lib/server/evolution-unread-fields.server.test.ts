import { describe, expect, it } from 'vitest';
import { readTracked } from './evolution-operations.server';

describe('an operation names the fields it never read [rule:45671e38]', () => {
	it('names a misspelt field and nothing the operation read', () => {
		const { op, unread } = readTracked({ op: 'add_data_draft', requestId: 'r', kind: 'amend', entityId: 'e', fields: [] });
		void op.entityId;
		void op.addFields;
		expect(unread()).toEqual(['fields']);
	});

	it('names nothing when every field was read', () => {
		const { op, unread } = readTracked({ op: 'validate_field', requestId: 'r', fieldPath: 'x' });
		void op.fieldPath;
		expect(unread()).toEqual([]);
	});
});
