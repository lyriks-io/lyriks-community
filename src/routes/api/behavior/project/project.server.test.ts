import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: async () => {} }));
const { POST } = await import('./+server');

const execute = vi.fn(async () => ({ kind: 'answer', value: { ok: true } }));
const detectCollision = vi.fn(async () => [] as string[]);
const invalidate = vi.fn();
const event = (featureId: string, alias = false) => ({
	request: new Request('http://x/api/behavior/project', {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ projectId: 'p1', operations: [{
			[alias ? 'op' : 'kind']: 'promote_to_project_library', featureId,
			definitionKind: 'entity', id: 'entity-1'
		}] })
	}),
	locals: { authRequired: false, services: {
		loadFeaturesDraft: { execute: async () => ({ features: [{ id: 'own-feature' }] }) },
		detectFeatureIdCollision: { execute: detectCollision },
		authorProjectBehavior: { execute },
		implementationCoverage: { invalidate },
		scheduleBackSync: async () => {}
	} },
	cookies: { get: () => undefined }
}) as never;

describe('project library promotion authorization', () => {
	beforeEach(() => { vi.clearAllMocks(); detectCollision.mockResolvedValue([]); });

	it.each([false, true])('refuses a foreign source before any engine call, alias=%s [unspa:628f3070:8a4449b2:a3f7ede6]', async (alias) => {
		const result = await Promise.resolve(POST(event('foreign-feature', alias))).catch((error: unknown) => error);
		expect(isHttpError(result) && result.status).toBe(404);
		expect(execute).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('refuses a globally ambiguous source before mutation', async () => {
		detectCollision.mockResolvedValue(['foreign-project']);
		const result = await Promise.resolve(POST(event('own-feature'))).catch((error: unknown) => error);
		expect(isHttpError(result) && result.status).toBe(409);
		expect(execute).not.toHaveBeenCalled();
	});

	it('accepts a source owned by the authorized project', async () => {
		const response = await POST(event('own-feature'));
		expect(await response.json()).toMatchObject({ ok: true });
		expect(execute).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
	});
});
