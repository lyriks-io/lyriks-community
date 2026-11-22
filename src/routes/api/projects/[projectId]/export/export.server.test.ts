import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, AuditEvent } from '$application/ports';
import { GET } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/** Taking a whole project home as a zip: for its authors only, never cached. */

const ZIP = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);

/** The access service as the team server answers it: a reader may read, a designer may also write. */
function role(name: 'reader' | 'designer') {
	return (action: AccessAction): AccessDecision =>
		name === 'designer' || (name === 'reader' && action === 'read') ? { ok: true } : { ok: false, reason: 'forbidden' };
}

function exportAs(decide: (action: AccessAction) => AccessDecision, projectId = 'p-shop') {
	const exported: string[] = [];
	const audit: AuditEvent[] = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => decide(action) },
		enterpriseHooks: null,
		exportProject: {
			execute: async (id) => {
				exported.push(id);
				return id === 'p-shop' ? { fileName: 'shop-2026-11-18.lyriks.zip', bytes: ZIP, projectName: 'Shop', warnings: [] } : null;
			}
		},
		audit: { record: (event) => void audit.push(event) }
	});
	const event = requestEvent({
		path: `/api/projects/${projectId}/export`,
		params: { projectId },
		authRequired: true,
		session: { isAuthenticated: true, email: 'dana@example.test' },
		services,
		cookies: { lyriks_session: 'jwt' }
	});
	const response = Promise.resolve(GET(event)).then(
		(r) => r,
		(failure: unknown) => (isHttpError(failure) ? failure.status : Promise.reject(failure))
	);
	return { response, exported, audit };
}

describe('exporting a project', () => {
	it('answers the bundle as a zip attachment that no proxy may keep, and audits who took it', async () => {
		const { response, audit } = exportAs(role('designer'));
		const r = (await response) as Response;
		expect(r.status).toBe(200);
		expect(r.headers.get('content-type')).toBe('application/zip');
		expect(r.headers.get('content-disposition')).toBe('attachment; filename="shop-2026-11-18.lyriks.zip"');
		expect(r.headers.get('cache-control')).toBe('no-store');
		expect(new Uint8Array(await r.arrayBuffer())).toEqual(ZIP);
		expect(audit).toMatchObject([{ action: 'project.export', actor: 'dana@example.test', target: 'p-shop', outcome: 'success' }]);
	});

	it('refuses a reader who may see the project but not author it, exporting nothing', async () => {
		const { response, exported, audit } = exportAs(role('reader'));
		expect(await response).toBe(403);
		expect(exported).toEqual([]);
		expect(audit).toEqual([]);
	});

	it('answers 404 for a project with nothing to export', async () => {
		const { response, audit } = exportAs(role('designer'), 'p-gone');
		expect(await response).toBe(404);
		expect(audit).toEqual([]);
	});
});
