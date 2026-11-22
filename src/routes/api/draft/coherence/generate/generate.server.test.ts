import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision } from '$application/ports';
import type { GenerateSpecsResult } from '$application/specification/generate-specs';
import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/** Generating the specifications: for the authors of the project, under its revision lock. */

function generate(body: unknown, opts: { decide?: (action: AccessAction) => AccessDecision; result?: GenerateSpecsResult; revision?: string } = {}) {
	const runs: Array<{ projectId: string; expectedRevision: number | null; origin: string | null }> = [];
	const pushed: string[] = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => (opts.decide ?? (() => ({ ok: true })))(action) },
		enterpriseHooks: null,
		generateSpecs: {
			execute: async (projectId, save) => {
				runs.push({ projectId, expectedRevision: save.expectedRevision ?? null, origin: save.origin ?? null });
				return opts.result ?? { ok: true, revision: 8 };
			}
		},
		pushEnvelopeToBack: {
			execute: async (projectId) => {
				pushed.push(projectId);
				return true;
			}
		}
	});
	const headers: Record<string, string> = { 'x-lyriks-client': 'tab-1' };
	if (opts.revision !== undefined) headers['x-lyriks-rev'] = opts.revision;
	const event = requestEvent({ path: '/api/draft/coherence/generate', method: 'POST', body: JSON.stringify(body), headers, authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
	const outcome = Promise.resolve(POST(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
	return { outcome, runs, pushed };
}

describe('generating the specifications', () => {
	it('generates under the revision the page holds and mirrors the result to the Back', async () => {
		const { outcome, runs, pushed } = generate({ projectId: 'p-shop' }, { revision: '7' });
		expect(await outcome).toMatchObject({ status: 200, body: { ok: true, revision: 8 } });
		expect(runs).toEqual([{ projectId: 'p-shop', expectedRevision: 7, origin: 'tab-1' }]);
		expect(pushed).toEqual(['p-shop']);
	});

	it('answers 409 when the section moved meanwhile, mirroring nothing', async () => {
		const { outcome, pushed } = generate({ projectId: 'p-shop' }, { result: { ok: false, reason: 'conflict' } });
		expect((await outcome).status).toBe(409);
		expect(pushed).toEqual([]);
	});

	it('reports a refused generation (a spec with gaps) without mirroring it', async () => {
		const { outcome, pushed } = generate({ projectId: 'p-shop' }, { result: { ok: false, reason: 'gaps' } });
		expect(await outcome).toMatchObject({ status: 200, body: { ok: false, reason: 'gaps' } });
		expect(pushed).toEqual([]);
	});

	it('is refused to a reader who may not author the project, generating nothing', async () => {
		const reader = (action: AccessAction): AccessDecision => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' });
		const { outcome, runs } = generate({ projectId: 'p-shop' }, { decide: reader });
		expect((await outcome).status).toBe(403);
		expect(runs).toEqual([]);
	});

	it('requires the project id', async () => {
		const { outcome, runs } = generate({});
		expect((await outcome).status).toBe(400);
		expect(runs).toEqual([]);
	});
});
