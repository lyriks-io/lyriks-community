import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, AdoptionResult } from '$application/ports';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { GET, POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIndexGuard } from '$lib/server/index-revisions.fixture';

/**
 * Where each spec element lives in the code, as the caller found it: read by
 * whoever may read the project, reported by whoever may write it, and every
 * landed report refreshes the Features chips and the workflow statuses.
 */

function engine(opts: { decide?: (action: AccessAction) => AccessDecision; answer?: AdoptionResult | null; clashes?: string[] } = {}) {
	const reported: unknown[] = [];
	const invalidated: string[] = [];
	const answer = opts.answer === undefined ? ({ ok: true, value: { recorded: 1 } } as AdoptionResult) : opts.answer;
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => (opts.decide ?? (() => ({ ok: true })))(action) },
		enterpriseHooks: null,
		loadFeaturesDraft: {
			execute: async (projectId) => {
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = [{ id: 'feat-cart', name: 'Cart', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-cart' }];
				return draft;
			}
		},
		detectFeatureIdCollision: { execute: async () => opts.clashes ?? [] },
		codeAdoption: {
			getImplementationStatus: async (featureId, scope) => (answer?.ok ? { ok: true, value: { featureId, scope: scope ?? {} } } : answer),
			reportImplementationStatus: async (input) => {
				reported.push(input);
				return answer;
			},
			reportImplementationStatusBatch: async (featureId, entries) => {
				reported.push({ featureId, entries });
				return answer;
			}
		},
		implementationCoverage: { invalidate: (projectId) => void invalidated.push(projectId) },
		guardIndexWrite: memoryIndexGuard()
	});
	return { services, reported, invalidated };
}

async function send(services: ReturnType<typeof engine>['services'], method: 'GET' | 'POST', body?: unknown, query = '') {
	const event = requestEvent({
		path: `/api/behavior/implementation/status${query}`,
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
		authRequired: true,
		services,
		cookies: { lyriks_session: 'jwt' }
	});
	return Promise.resolve(method === 'GET' ? GET(event) : POST(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
}

const REPORT = { projectId: 'p-shop', featureId: 'feat-cart', actionId: 'act-pay', foundEntities: [{ file: 'src/pay.ts', line: 12 }] };

describe('reading where a feature is implemented', () => {
	it('answers the engine status of a feature the project declares, for one action when asked', async () => {
		const { services } = engine();
		expect(await send(services, 'GET', undefined, '?projectId=p-shop&featureId=feat-cart&actionId=act-pay')).toEqual({
			status: 200,
			body: { available: true, ok: true, featureId: 'feat-cart', scope: { actionId: 'act-pay' }, revision: 0 }
		});
	});

	it('refuses a feature the project does not declare, and needs both ids', async () => {
		const { services } = engine();
		expect((await send(services, 'GET', undefined, '?projectId=p-shop&featureId=feat-payroll')).status).toBe(404);
		expect((await send(services, 'GET', undefined, '?projectId=p-shop')).status).toBe(400);
	});

	it('says the engine is unavailable rather than inventing an answer', async () => {
		const { services } = engine({ answer: null });
		expect((await send(services, 'GET', undefined, '?projectId=p-shop&featureId=feat-cart')).status).toBe(503);
	});
});

describe('reporting where a feature is implemented', () => {
	it('records the report, then refreshes the coverage chips of the project', async () => {
		const { services, reported, invalidated } = engine();
		expect(await send(services, 'POST', REPORT)).toEqual({ status: 200, body: { available: true, ok: true, recorded: 1, revision: 1 } });
		expect(reported).toEqual([{ featureId: 'feat-cart', actionId: 'act-pay', foundEntities: REPORT.foundEntities }]);
		expect(invalidated).toEqual(['p-shop']);
	});

	it('records a batch of reports in one call, and refreshes the same way', async () => {
		const { services, reported, invalidated } = engine();
		const entries = [{ actionId: 'act-pay', foundEntities: [] }, { surfaceId: 'srf-cart', foundEntities: [] }];
		expect((await send(services, 'POST', { projectId: 'p-shop', featureId: 'feat-cart', entries })).status).toBe(200);
		expect(reported).toEqual([{ featureId: 'feat-cart', entries }]);
		expect(invalidated).toEqual(['p-shop']);
	});

	it('relays an engine refusal and refreshes nothing', async () => {
		const { services, invalidated } = engine({ answer: { ok: false, error: 'untraced element' } });
		const answer = await send(services, 'POST', REPORT);
		expect(answer).toMatchObject({ status: 200, body: { ok: false } });
		expect(invalidated).toEqual([]);
	});

	it('refuses a reader, a foreign feature, a shared feature id and a malformed report, recording nothing', async () => {
		const reader = engine({ decide: (action) => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' }) });
		expect((await send(reader.services, 'GET', undefined, '?projectId=p-shop&featureId=feat-cart')).status).toBe(200);
		expect((await send(reader.services, 'POST', REPORT)).status).toBe(403);
		const plain = engine();
		expect((await send(plain.services, 'POST', { ...REPORT, featureId: 'feat-payroll' })).status).toBe(404);
		expect((await send(plain.services, 'POST', { projectId: 'p-shop', featureId: 'feat-cart' })).status).toBe(400);
		expect((await send(plain.services, 'POST', { projectId: 'p-shop', featureId: 'feat-cart', entries: [] })).status).toBe(400);
		const shared = engine({ clashes: ['p-other'] });
		expect((await send(shared.services, 'POST', REPORT)).status).toBe(409);
		expect([...reader.reported, ...plain.reported, ...shared.reported]).toEqual([]);
	});
});
