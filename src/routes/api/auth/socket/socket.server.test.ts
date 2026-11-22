import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The upgrade proxy asks this endpoint which collaborative room a socket may
 * join. The answer is only ever a room of a project the caller may write, for
 * a feature that project declares, through the real project access gate.
 */

function ask(path: string, opts: { decision?: AccessDecision; multiUser?: boolean } = {}) {
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		identity: { multiUser: opts.multiUser ?? true },
		loadFeaturesDraft: {
			execute: async (projectId) => {
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = [{ id: 'feat-cart', name: 'Cart', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-cart' }];
				return draft;
			}
		}
	});
	const event = requestEvent({
		path: `/api/auth/socket?path=${encodeURIComponent(path)}`,
		authRequired: true,
		session: { isAuthenticated: true, email: 'dana@example.test' },
		services,
		cookies: { lyriks_session: 'jwt' }
	});
	return Promise.resolve(GET(event)).then(
		async (response) => ({ status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: null, cache: null } : Promise.reject(failure))
	);
}

describe('authorizing a collaborative socket', () => {
	it('names the project-qualified room of a feature the caller may write, never cached', async () => {
		expect(await ask('/yjs/feature:feat-cart?project=p-shop')).toEqual({
			status: 200,
			body: { upstreamPath: '/yjs/p-shop:feature:feat-cart' },
			cache: 'no-store'
		});
	});

	it('refuses a project the caller may not write', async () => {
		expect((await ask('/yjs/feature:feat-cart?project=p-shop', { decision: { ok: false, reason: 'forbidden' } })).status).toBe(403);
	});

	it('refuses a feature the project does not declare', async () => {
		expect((await ask('/yjs/feature:feat-payroll?project=p-shop')).status).toBe(404);
	});

	it('keeps the shared behavior store to installation administrators', async () => {
		expect((await ask('/behavior/sync/feature:feat-cart')).status).toBe(403);
	});

	it('refuses an off-site or malformed room', async () => {
		expect((await ask('//evil.test/yjs/feature:feat-cart?project=p-shop')).status).toBe(400);
		expect((await ask('/yjs/feature:feat-cart?project=../p-shop')).status).toBe(400);
	});
});
