import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';

vi.mock('$lib/server/project-scope.server', () => ({ callerCanSeeProject: async () => true }));
const { requireProjectAccess } = await import('./project-access.server');

describe('project access response', () => {
	it.each([
		['unauthenticated', 401], ['forbidden', 403], ['not_found', 404], ['unavailable', 503]
	] as const)('reports %s as HTTP%s without running the protected write', async (reason, status) => {
		const write = vi.fn();
		const event = {
			locals: { authRequired: true, services: { installEdition: () => undefined, resolveActiveProject: { execute: async () => null }, projectAccess: {
				authorize: async (): Promise<AccessDecision> => ({ ok: false, reason })
			} } }, cookies: { get: () => 'token' }
		} as never;
		const failure = await requireProjectAccess(event, 'p', 'write').then(write).catch((error: unknown) => error);
		expect(isHttpError(failure) && failure.status).toBe(status);
		expect(write).not.toHaveBeenCalled();
	});
});
