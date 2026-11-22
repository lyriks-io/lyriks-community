import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import type { FeatureAdvice } from '$application/use-cases';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/** The maturity badges of the Features page, served from the cached engine scoring. */

const ADVICE: FeatureAdvice[] = [{ featureId: 'feat-cart', summary: null, score: null, gaps: [] }];

function score(query: string, opts: { available?: boolean; decision?: AccessDecision } = {}) {
	const reads: string[] = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		advisorAvailable: () => opts.available ?? true,
		featureAdvice: {
			get: async (projectId) => {
				reads.push(projectId);
				return ADVICE;
			}
		}
	});
	const event = requestEvent({ path: `/api/features/score?${query}`, authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
	const outcome = Promise.resolve(GET(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: null } : Promise.reject(failure))
	);
	return { outcome, reads };
}

describe('the feature scoring endpoint', () => {
	it('answers the cached advice of the project when the engine is there', async () => {
		const { outcome, reads } = score('projectId=p-shop');
		expect(await outcome).toEqual({ status: 200, body: { available: true, advice: ADVICE } });
		expect(reads).toEqual(['p-shop']);
	});

	it('says the engine is not there, with no advice, instead of failing the page', async () => {
		const { outcome, reads } = score('projectId=p-shop', { available: false });
		expect(await outcome).toEqual({ status: 200, body: { available: false, advice: [] } });
		expect(reads).toEqual([]);
	});

	it('refuses a caller who may not read the project', async () => {
		const { outcome, reads } = score('projectId=p-shop', { decision: { ok: false, reason: 'not_found' } });
		expect((await outcome).status).toBe(404);
		expect(reads).toEqual([]);
	});

	it('requires the project id', async () => {
		expect((await score('').outcome).status).toBe(400);
	});
});
