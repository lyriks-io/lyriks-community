import { describe, expect, it } from 'vitest';
import { accessCount, matrixLines, type MatrixGroup } from './users';

const groups: MatrixGroup[] = [
	{
		heading: 'Short links · Shorten a link',
		featureId: 'shorten',
		rows: [{ capabilityId: 'cap-shorten', featureId: 'shorten', action: 'Shorten a link', roleIds: ['guest', 'user'] }]
	},
	{
		heading: 'Short links · Manage my links',
		featureId: 'manage',
		rows: [
			{ capabilityId: 'cap-see', featureId: 'manage', action: 'See my links', roleIds: ['user'] },
			{ capabilityId: 'cap-delete', featureId: 'manage', action: 'Delete a link', roleIds: [] }
		]
	}
];

describe('Users and permissions lists its users with a bar of what each can do; a click opens that user\'s page [criterion:4146848b]', () => {
	it('counts, for one user, the actions it can do out of every action of the matrix', () => {
		expect(accessCount(groups, (row) => row.roleIds.includes('guest'))).toEqual({ granted: 1, total: 3 });
		expect(accessCount(groups, (row) => row.roleIds.includes('user'))).toEqual({ granted: 2, total: 3 });
	});

	it('reads a cell ticked but not read back yet as the page passes it', () => {
		expect(accessCount(groups, (row) => row.capabilityId === 'cap-delete' || row.roleIds.includes('user')).granted).toBe(3);
	});
});

describe('Who can do what opens on its own page and holds any number of users [criterion:5787390d]', () => {
	it('lays the matrix out as one list of lines, a heading then its actions, each with its own key', () => {
		const lines = matrixLines(groups);
		expect(lines.map((l) => (l.kind === 'group' ? `# ${l.heading}` : l.row.action))).toEqual([
			'# Short links · Shorten a link',
			'Shorten a link',
			'# Short links · Manage my links',
			'See my links',
			'Delete a link'
		]);
		expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
	});
});
