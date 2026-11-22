import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * Deleting a state from the behavior dashboard: only through a project the
 * caller may write, only for a feature that project declares, never for a
 * feature id another project also holds.
 */

const STATE = { projectId: 'p-shop', featureId: 'feat-cart', surfaceId: 'cart', stateDefinitionId: 'empty' };

function engine(opts: { decision?: AccessDecision; clashes?: string[] } = {}) {
	const deleted: Array<typeof STATE> = [];
	const synced: string[] = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		loadFeaturesDraft: {
			execute: async (projectId) => {
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = [{ id: 'feat-cart', name: 'Cart', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-cart' }];
				return draft;
			}
		},
		detectFeatureIdCollision: { execute: async () => opts.clashes ?? [] },
		deleteBehaviorState: {
			execute: async (input) => {
				deleted.push({ projectId: input.projectId, featureId: input.featureId, surfaceId: input.surfaceId, stateDefinitionId: input.stateDefinitionId });
				return { ok: true, message: 'State deleted. Behavior validation passed.', code: 'DELETED', formalChecked: false };
			}
		},
		scheduleBackSync: async (projectId) => void synced.push(projectId)
	});
	return { services, deleted, synced };
}

async function post(services: ReturnType<typeof engine>['services'], body: unknown) {
	const event = requestEvent({ path: '/api/behavior/state/delete', method: 'POST', body: JSON.stringify(body), authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
	return Promise.resolve(POST(event)).then(
		async (response) => ({ status: response.status, body: await response.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

describe('deleting a behavior state', () => {
	it('deletes the state of a feature the project declares and schedules the project for the Back', async () => {
		const { services, deleted, synced } = engine();
		expect(await post(services, STATE)).toMatchObject({ status: 200, body: { ok: true, code: 'DELETED' } });
		expect(deleted).toEqual([STATE]);
		expect(synced).toEqual(['p-shop']);
	});

	it('requires the four ids, deleting nothing', async () => {
		const { services, deleted } = engine();
		expect((await post(services, { ...STATE, stateDefinitionId: '' })).status).toBe(400);
		expect((await post(services, null)).status).toBe(400);
		expect(deleted).toEqual([]);
	});

	it('refuses a caller who may not write the project, deleting nothing', async () => {
		const { services, deleted } = engine({ decision: { ok: false, reason: 'forbidden' } });
		expect((await post(services, STATE)).status).toBe(403);
		expect(deleted).toEqual([]);
	});

	it('refuses a feature the project does not declare, deleting nothing', async () => {
		const { services, deleted } = engine();
		expect((await post(services, { ...STATE, featureId: 'feat-payroll' })).status).toBe(404);
		expect(deleted).toEqual([]);
	});

	it('refuses a feature id another project also holds, naming it, deleting nothing', async () => {
		const { services, deleted } = engine({ clashes: ['p-other'] });
		const refused = await post(services, STATE);
		expect(refused.status).toBe(409);
		expect(JSON.stringify(refused.body)).toContain('p-other');
		expect(deleted).toEqual([]);
	});
});
