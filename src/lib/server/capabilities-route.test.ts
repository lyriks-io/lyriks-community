import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createEmptyUsersDraft } from '$domain/users';
import { GET } from '../../routes/api/draft/users/capabilities/+server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), load: vi.fn(), derived: vi.fn() }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: mocks.access }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ loadUsersDraft: { execute: mocks.load }, refreshDerivedCapabilities: { execute: mocks.derived } }) }));

describe('capability registry read boundary', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.load.mockResolvedValue(createEmptyUsersDraft('p'));
		mocks.derived.mockResolvedValue({ features: [], journeys: [], surfaces: [{ id: 'screen:editor', source: 'surface', label: 'Editor' }] });
	});
	const event = (query = '?projectId=p') => ({ url: new URL('http://localhost/api/draft/users/capabilities' + query) }) as Parameters<typeof GET>[0];
	it('returns copyable canonical ids under project read access', async () => {
		const request = event();
		const result = await (await GET(request)).json();
		expect(mocks.access).toHaveBeenCalledWith(request, 'p', 'read');
		expect(result.capabilities).toContainEqual(expect.objectContaining({ capabilityId: 'screen:editor', capabilitySource: 'surface' }));
	});
	it('does not load project data after access is denied', async () => {
		mocks.access.mockRejectedValueOnce(new Error('forbidden'));
		await expect(GET(event())).rejects.toThrow('forbidden');
		expect(mocks.load).not.toHaveBeenCalled();
		expect(mocks.derived).not.toHaveBeenCalled();
	});
	it('requires a project id before access or reads', async () => {
		await expect(GET(event(''))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 400);
		expect(mocks.access).not.toHaveBeenCalled();
		expect(mocks.load).not.toHaveBeenCalled();
	});
});
