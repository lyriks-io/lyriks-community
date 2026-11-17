import { describe, expect, it } from 'vitest';
import { adminNamesOf, namesAnAdmin } from './users';

describe('a person a drawing names is an admin when a role of the admin class bears that name [criterion:ac-leaf-ac-evo-func-uml]', () => {
	const roles = [
		{ name: 'Admin', tone: 'admin' },
		{ name: 'Operator', tone: 'ops' },
		{ name: 'Visitor', tone: 'visitor' },
		{ name: ' ', tone: 'admin' }
	];

	it('keeps the named roles of the admin class only', () => {
		expect(adminNamesOf(roles)).toEqual(['Admin', 'Operator']);
	});

	it('reads the name whatever its case, its spaces or a plural', () => {
		const admins = adminNamesOf(roles);
		expect(namesAnAdmin('admin', admins)).toBe(true);
		expect(namesAnAdmin('  Admins ', admins)).toBe(true);
		expect(namesAnAdmin('Operators', admins)).toBe(true);
		expect(namesAnAdmin('Visitor', admins)).toBe(false);
		expect(namesAnAdmin('Administrator', admins)).toBe(false);
		expect(namesAnAdmin('', admins)).toBe(false);
	});
});
