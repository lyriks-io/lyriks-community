import { describe, expect, it, vi } from 'vitest';
import { error, type Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { resolveCurrentProjectContext } from './app-chrome.server';
const projects = [{ id: 'p', name: 'Confirmed project' }, { id: 'other', name: 'Other private name' }];
const services = { listProjects: { execute: async () => projects } } as unknown as AppServices;
const cookies = { get: () => 'p' } as unknown as Cookies;
describe('current-project availability is distinct from permission [criterion:f090189e]', () => {
	it('a 503 preserves only the requested identity without exposing any unverified name [unspa:be506881:87c596a8:090fcc31]', async () => {
		const read = vi.fn(async () => error(503, 'unavailable'));
		const result = await resolveCurrentProjectContext(services, 'p', cookies, read);
		expect(result).toEqual({ currentProject: null, currentProjectUnavailable: true, contextProjectId: 'p' });
		expect(read.mock.calls).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain('Confirmed project'); expect(JSON.stringify(result)).not.toContain('private');
	});
	it('a remembered-project outage does not silently pick another project', async () => {
		const read = vi.fn(async () => error(503, 'unavailable'));
		expect((await resolveCurrentProjectContext(services, undefined, cookies, read)).currentProjectUnavailable).toBe(true);
		expect(read).toHaveBeenCalledTimes(1);
	});
	it.each([401, 403, 404])('a definite %i denial clears the current project instead of retaining unavailable context', async (status) => {
		expect(await resolveCurrentProjectContext(services, 'p', cookies, async () => error(status, 'denied'))).toEqual({ currentProject: null, currentProjectUnavailable: false, contextProjectId: 'p' });
	});
	it('recovery performs a fresh authorization instead of trusting retained metadata [unspa:be506881:87c596a8:80d0ec1b]', async () => {
		const read = vi.fn<(_id: string) => Promise<boolean>>().mockResolvedValue(true);
		// A genuine SvelteKit availability error, followed by a fresh successful read.
		read.mockImplementationOnce(async () => error(503, 'unavailable'));
		expect((await resolveCurrentProjectContext(services, 'p', cookies, read)).currentProject).toBeNull();
		expect((await resolveCurrentProjectContext(services, 'p', cookies, read)).currentProject).toEqual(projects[0]);
		expect(read).toHaveBeenCalledTimes(2);
	});
	it('unexpected programming failures are not converted to missing or unavailable projects', async () => {
		await expect(resolveCurrentProjectContext(services, 'p', cookies, async () => { throw new Error('broken adapter'); })).rejects.toThrow('broken adapter');
	});
});
