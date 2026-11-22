import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import { loadVisitDelta } from '$lib/server/coherence-visit.server';
import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/** What one person saw open in the Control Center, kept for their next visit. */

function visit(body: unknown, opts: { decision?: AccessDecision; email?: string } = {}) {
	const residue = new Map<string, unknown>();
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async () => opts.decision ?? { ok: true } },
		enterpriseHooks: null,
		currentSession: () => ({ isAuthenticated: true, email: opts.email ?? 'ada@example.test' }),
		clock: { nowIso: () => '2026-11-18T03:00:00.000Z' },
		projectResidue: {
			load: async (projectId, section) => residue.get(`${projectId}/${section}`) ?? null,
			save: async (projectId, section, payload) => void residue.set(`${projectId}/${section}`, payload)
		}
	});
	const event = requestEvent({
		path: '/api/projects/p-shop/coherence/seen',
		method: 'POST',
		params: { projectId: 'p-shop' },
		body: JSON.stringify(body),
		authRequired: true,
		services,
		cookies: { lyriks_session: 'jwt' }
	});
	const outcome = Promise.resolve(POST(event)).then(
		(r) => r.status,
		(failure: unknown) => (isHttpError(failure) ? failure.status : Promise.reject(failure))
	);
	return { outcome, residue, services };
}

describe('marking what was seen in the Control Center', () => {
	it('keeps the open gaps for this person, so the next visit says what is new', async () => {
		const { outcome, services } = visit({ gapIds: ['gap-1', 'gap-2', 7, ''] });
		expect(await outcome).toBe(200);
		expect(await services.projectResidue.load('p-shop', 'seen:ada@example.test')).toEqual({ gapIds: ['gap-1', 'gap-2'], at: '2026-11-18T03:00:00.000Z' });
		const delta = await loadVisitDelta(services.projectResidue, 'p-shop', 'ada@example.test', ['gap-2', 'gap-3']);
		expect(delta).not.toBeNull();
		expect(await loadVisitDelta(services.projectResidue, 'p-shop', 'bob@example.test', ['gap-2'])).toBeNull();
	});

	it('is refused to a caller who may not read the project, keeping nothing', async () => {
		const { outcome, residue } = visit({ gapIds: ['gap-1'] }, { decision: { ok: false, reason: 'not_found' } });
		expect(await outcome).toBe(404);
		expect(residue.size).toBe(0);
	});
});
