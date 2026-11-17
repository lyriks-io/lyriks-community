import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEmptyUsersDraft, type ProjectUsersDraft } from '$domain/users';
import { USERS_WRITE } from './section-write-specs.server';

const action = { id: 'action:f1:a1', label: 'Add a bookmark', source: 'feature' as const, sourceRefId: 'c1', sourceRefLabel: 'Save links', featureId: 'f1', featureLabel: 'Add' };
const roles = [{ id: 'member', name: 'Member', description: '', userCountMin: 1, userCountMax: null, tone: 'customer' }];

function servicesSaving(stored: ProjectUsersDraft | null = null) {
	const execute = vi.fn(async () => ({ savedAt: 'now', coherenceScore: 100 }));
	const services = {
		saveUsersDraft: { execute },
		loadUsersDraft: { execute: async () => stored },
		refreshDerivedCapabilities: { execute: async () => ({ features: [action], journeys: [], surfaces: [] }) }
	} as unknown as AppServices;
	return { services, execute };
}

describe('a Users write that still names a verb is accepted [criterion:464a725a]', () => {
	const body = {
		roles,
		permissions: [
			{ roleId: 'member', capabilityId: action.id, capabilitySource: 'feature', action: 'create' },
			{ roleId: 'member', capabilityId: action.id, capabilitySource: 'feature', action: 'delete' }
		]
	};

	it('passes the guard, stores one access without its verb, and says so in a note', async () => {
		const { services, execute } = servicesSaving(createEmptyUsersDraft('p1'));
		await USERS_WRITE.validate(body);
		const answer = await USERS_WRITE.persist(USERS_WRITE.parse(body, 'p1'), services, 'p1');

		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({ permissions: [{ roleId: 'member', capabilityId: action.id, capabilitySource: 'feature' }] })
		);
		expect(answer).toMatchObject({ savedAt: 'now', note: expect.stringContaining('permissions[].action ignored on 2 row(s)') });
	});

	it('answers without a note when nothing was ignored', async () => {
		const { services } = servicesSaving(createEmptyUsersDraft('p1'));
		const clean = { roles, permissions: [{ roleId: 'member', capabilityId: action.id, capabilitySource: 'feature' }] };
		const answer = await USERS_WRITE.persist(USERS_WRITE.parse(clean, 'p1'), services, 'p1');
		expect(answer).toEqual({ savedAt: 'now', coherenceScore: 100 });
	});
});
