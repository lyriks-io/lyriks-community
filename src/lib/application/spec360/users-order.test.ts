import { describe, expect, it } from 'vitest';
import { endUsersFirst, specUsers } from './users';
import type { ProjectUsersDraft } from '$domain/users';

describe('the Specification 360° lists the end users first, then the admins [criterion:c6cca8af]', () => {
	it('puts every end user before every admin, each class in the order of the roster when no name tells them apart', () => {
		const users = [
			{ id: 'a', userClass: 'end' as const },
			{ id: 'b', userClass: 'admin' as const },
			{ id: 'c', userClass: 'end' as const },
			{ id: 'd', userClass: 'admin' as const },
			{ id: 'e', userClass: 'end' as const }
		];
		expect(endUsersFirst(users).map((u) => u.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
	});

	it('reads the roster that way, the walk of validation and the columns of who can do what included', () => {
		const draft = {
			roles: [
				{ id: 'member', name: 'Group member', description: '', tone: 'customer' },
				{ id: 'admin', name: 'Group admin', description: '', tone: 'admin' },
				{ id: 'invited', name: 'Invited group member', description: '', tone: 'customer' },
				{ id: 'ops', name: 'Call link admin', description: '', tone: 'ops' }
			],
			permissions: []
		} as unknown as ProjectUsersDraft;
		expect(specUsers(draft).map((u) => u.id)).toEqual(['member', 'invited', 'ops', 'admin']);
	});
});

describe('each class of users reads from A to Z [criterion:4b3d2b4d]', () => {
	it('sorts the end users and the admins by name, accents and case ignored', () => {
		const users = [
			{ id: '1', name: 'Magasinier', userClass: 'end' as const },
			{ id: '2', name: 'Administrateur ERP', userClass: 'admin' as const },
			{ id: '3', name: 'acheteur', userClass: 'end' as const },
			{ id: '4', name: 'Écran admin', userClass: 'admin' as const },
			{ id: '5', name: 'Commercial / ADV', userClass: 'end' as const }
		];
		expect(endUsersFirst(users).map((u) => u.name)).toEqual(['acheteur', 'Commercial / ADV', 'Magasinier', 'Administrateur ERP', 'Écran admin']);
	});
});
