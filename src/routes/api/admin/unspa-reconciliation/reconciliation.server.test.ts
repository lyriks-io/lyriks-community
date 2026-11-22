import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AuditEvent } from '$application/ports';
import type { ReconcileProjectInput, ReconcileProjectResult } from '$application/specification/reconcile-project';

const privateEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

import { POST } from './+server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/** An administrator merges a project's twin kernel folders; nothing else may reach the disk through it. */

const ADMIN = 'root@example.test';

function plan(input: ReconcileProjectInput, status: ReconcileProjectResult['status']): ReconcileProjectResult {
	return {
		projectId: input.projectId,
		canonicalKernelId: input.canonicalKernelId,
		sources: [...input.sourceFolderKeys],
		status,
		automaticActions: [],
		conflicts: [],
		quarantineActions: [],
		canonicalManifest: { projectId: input.projectId, name: 'Shop', featureIds: ['feat-cart'] },
		mergedFeatures: [{ id: 'feat-cart', content: { secret: 'whole feature snapshot' }, fromFolderKey: input.canonicalKernelId }],
		applied: status !== 'conflicts' && input.apply === true
	};
}

function reconcile(body: unknown, opts: { email?: string; status?: ReconcileProjectResult['status'] } = {}) {
	const runs: ReconcileProjectInput[] = [];
	const audit: AuditEvent[] = [];
	const services = servicesWith({
		reconcileProject: {
			execute: async (input) => {
				runs.push(input);
				return plan(input, opts.status ?? 'clean');
			}
		},
		audit: { record: (event) => void audit.push(event) }
	});
	const event = requestEvent({
		path: '/api/admin/unspa-reconciliation',
		method: 'POST',
		body: JSON.stringify(body),
		authRequired: true,
		session: { isAuthenticated: true, email: opts.email ?? ADMIN },
		services
	});
	const response = Promise.resolve(POST(event)).then(
		async (r) => ({ status: r.status, body: await r.json() }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body } : Promise.reject(failure))
	);
	return { response, runs, audit };
}

const VALID = { projectId: 'p-shop', canonicalKernelId: 'p-shop', sourceFolderKeys: ['p-shop', 'shop-old', 'p-shop'], apply: true };

afterEach(() => {
	delete privateEnv.LYRIKS_ADMIN_EMAILS;
});

describe('reconciling twin kernel folders', () => {
	it('runs the plan on the distinct folders and answers it without the merged feature contents', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const { response, runs, audit } = reconcile(VALID);
		const { status, body } = await response;
		expect(status).toBe(200);
		expect(runs).toEqual([{ projectId: 'p-shop', canonicalKernelId: 'p-shop', sourceFolderKeys: ['p-shop', 'shop-old'], apply: true }]);
		expect(body).toMatchObject({ status: 'clean', applied: true, mergedFeatureCount: 1 });
		expect(JSON.stringify(body)).not.toContain('whole feature snapshot');
		expect(audit).toMatchObject([{ action: 'unspa.reconcile', actor: ADMIN, target: 'p-shop', outcome: 'success' }]);
	});

	it('only previews unless apply is exactly true', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const { response, runs } = reconcile({ ...VALID, apply: 'yes' });
		await response;
		expect(runs[0].apply).toBe(false);
	});

	it('answers 409 when the folders conflict, and audits a failure', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const { response, audit } = reconcile(VALID, { status: 'conflicts' });
		expect((await response).status).toBe(409);
		expect(audit).toMatchObject([{ outcome: 'failure' }]);
	});

	it.each([
		['a parent folder', { ...VALID, sourceFolderKeys: ['p-shop', '..'] }],
		['a nested path', { ...VALID, sourceFolderKeys: ['p-shop', 'x/../../etc'] }],
		['a project id with a separator', { ...VALID, projectId: 'p\\shop' }],
		['a single folder', { ...VALID, sourceFolderKeys: ['p-shop'] }],
		['a canonical folder outside the sources', { ...VALID, canonicalKernelId: 'elsewhere' }]
	])('refuses %s with 400, touching nothing', async (_name, body) => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const { response, runs } = reconcile(body);
		expect((await response).status).toBe(400);
		expect(runs).toEqual([]);
	});

	it('refuses a member who is not an administrator, touching nothing', async () => {
		privateEnv.LYRIKS_ADMIN_EMAILS = ADMIN;
		const { response, runs } = reconcile(VALID, { email: 'member@example.test' });
		expect((await response).status).toBe(403);
		expect(runs).toEqual([]);
	});
});
