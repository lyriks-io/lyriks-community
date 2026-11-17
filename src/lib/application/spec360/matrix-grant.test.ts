import { describe, expect, it } from 'vitest';
import { tickMatrixCell } from './matrix-grant';
import type { ProjectUsersDraft } from '$domain/users';

const draft = (permissions: ProjectUsersDraft['permissions']) =>
	({ roles: [{ id: 'member' }, { id: 'admin' }], permissions }) as unknown as ProjectUsersDraft;

describe('who can do what is ticked in place on the Specification 360° [criterion:eba33558]', () => {
	it('grants access, and no verb, on an empty cell', () => {
		expect(tickMatrixCell(draft([]), 'member', 'cap-1', 'feature', true)?.permissions).toEqual([{ roleId: 'member', capabilityId: 'cap-1', capabilitySource: 'feature' }]);
	});

	it("takes back the user's access to the action, and only theirs", () => {
		const held = draft([
			{ roleId: 'member', capabilityId: 'cap-1', capabilitySource: 'feature' },
			{ roleId: 'admin', capabilityId: 'cap-1', capabilitySource: 'feature' },
			{ roleId: 'member', capabilityId: 'cap-2', capabilitySource: 'feature' }
		]);
		expect(tickMatrixCell(held, 'member', 'cap-1', 'feature', false)?.permissions.map((g) => `${g.roleId}:${g.capabilityId}`)).toEqual(['admin:cap-1', 'member:cap-2']);
	});

	it('changes nothing when the cell already reads what was asked, or the user is gone', () => {
		expect(tickMatrixCell(draft([]), 'member', 'cap-1', 'feature', false)).toBeNull();
		expect(tickMatrixCell(draft([{ roleId: 'member', capabilityId: 'cap-1', capabilitySource: 'feature' }]), 'member', 'cap-1', 'feature', true)).toBeNull();
		expect(tickMatrixCell(draft([]), 'ghost', 'cap-1', 'feature', true)).toBeNull();
	});
});
