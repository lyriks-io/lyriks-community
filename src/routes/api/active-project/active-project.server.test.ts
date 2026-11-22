import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, ActiveProjectStorePort, AuditEvent } from '$application/ports';
import { MakeProjectActiveUseCase, ResolveActiveProjectUseCase } from '$application/portfolio/active-project';
import type { ProjectSummary } from '$domain/catalog';
import { GET, POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * Community works on one project at a time (EVO-001): this is the one door
 * that changes which. Over the real use-cases, an in-memory catalog and an
 * in-memory store of the choice.
 */

const project = (id: string, lastSavedAt: string): ProjectSummary => ({ id, name: id, description: '', industry: '', lastSavedAt });
const CATALOG = [project('p-old', '2026-11-01T00:00:00Z'), project('p-recent', '2026-11-17T00:00:00Z')];

function installation(edition: string, decide: (action: AccessAction) => AccessDecision = () => ({ ok: true })) {
	let chosen: string | null = null;
	const store = { load: async () => chosen, save: async (id) => void (chosen = id) } satisfies ActiveProjectStorePort;
	const catalog = { list: async () => CATALOG };
	const resolveActiveProject = new ResolveActiveProjectUseCase(() => edition, catalog, store);
	const audit: AuditEvent[] = [];
	const services = servicesWith({
		installEdition: () => edition,
		resolveActiveProject,
		makeProjectActive: new MakeProjectActiveUseCase(resolveActiveProject, catalog, store),
		projectAccess: { authorize: async (_id, _token, action) => decide(action) },
		enterpriseHooks: null,
		audit: { record: (e) => void audit.push(e) }
	});
	const event = (method: 'GET' | 'POST', body?: unknown) =>
		requestEvent({ path: '/api/active-project', method, body: body === undefined ? undefined : JSON.stringify(body), authRequired: true, services, cookies: { lyriks_session: 'jwt' } });
	const send = async (method: 'GET' | 'POST', body?: unknown) =>
		Promise.resolve(method === 'GET' ? GET(event('GET')) : POST(event('POST', body))).then(
			async (r) => ({ status: r.status, body: await r.json() }),
			(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
		);
	return { send, audit, chosen: () => chosen };
}

describe('the active project of a Community installation', () => {
	it('is the most recently saved one until someone chooses', async () => {
		expect((await installation('community').send('GET')).body).toEqual({ activeProjectId: 'p-recent' });
	});

	it('becomes the one a writer chooses, the previous one named, and audited', async () => {
		const c = installation('community');
		expect(await c.send('POST', { projectId: 'p-old' })).toEqual({ status: 200, body: { activeProjectId: 'p-old', previousProjectId: 'p-recent' } });
		expect((await c.send('GET')).body).toEqual({ activeProjectId: 'p-old' });
		expect(c.audit).toMatchObject([{ action: 'project.activate', target: 'p-old', detail: 'previous p-recent' }]);
	});

	it('is not changed by someone who may only read that project', async () => {
		const c = installation('community', (action) => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' }));
		expect((await c.send('POST', { projectId: 'p-old' })).status).toBe(403);
		expect(c.chosen()).toBeNull();
		expect(c.audit).toEqual([]);
	});

	it('refuses a project the catalog does not hold, and a request without one', async () => {
		const c = installation('community');
		expect((await c.send('POST', { projectId: 'p-ghost' })).status).toBe(404);
		expect((await c.send('POST', {})).status).toBe(400);
		expect(c.chosen()).toBeNull();
	});

	it('does not exist off Community, where every project is open', async () => {
		const e = installation('enterprise');
		expect((await e.send('GET')).body).toEqual({ activeProjectId: null });
		expect((await e.send('POST', { projectId: 'p-old' })).status).toBe(409);
		expect(e.chosen()).toBeNull();
	});
});
