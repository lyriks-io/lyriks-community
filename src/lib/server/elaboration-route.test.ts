import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { GET } from '../../routes/api/projects/elaboration/+server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), exists: vi.fn(), execute: vi.fn() }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: mocks.access }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ projectExists: mocks.exists, readProjectElaboration: { execute: mocks.execute } }) }));
const event = (query: string) => ({ url: new URL('http://localhost/api/projects/elaboration?' + query) }) as Parameters<typeof GET>[0];

describe('elaboration read boundary', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.exists.mockResolvedValue(true);
		mocks.execute.mockResolvedValue({ snapshot: { stable: true, key: 'revision' }, items: [
			{ id: 'a', kind: 'question', section: 'foundation' }, { id: 'b', kind: 'action', section: 'features' }, { id: 'c', kind: 'question', section: 'scope' }
		] });
	});
	it('filters before paging and enforces project read authorization', async () => {
		const request = event('projectId=p&kind=question&offset=1&limit=1&expectedSnapshot=revision');
		const result = await (await GET(request)).json();
		expect(result).toMatchObject({ total: 2, offset: 1, nextOffset: null, items: [{ id: 'c' }] });
		expect(mocks.access).toHaveBeenCalledWith(request, 'p', 'read');
		expect(mocks.execute).toHaveBeenCalledWith('p', false);
	});
	it('refuses an old pagination snapshot', async () => {
		await expect(GET(event('projectId=p&expectedSnapshot=old'))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 409);
	});
	it.each(['limit=0', 'limit=21', 'offset=-1', 'offset=0.5', 'kind=invalid', 'section=invalid', 'includeChecks=yes'])('validates %s without starting reads', async (query) => {
		await expect(GET(event('projectId=p&' + query))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 400);
		expect(mocks.execute).not.toHaveBeenCalled();
	});
	it('does not read after authorization fails', async () => {
		mocks.access.mockRejectedValueOnce(new Error('forbidden'));
		await expect(GET(event('projectId=p'))).rejects.toThrow('forbidden');
		expect(mocks.exists).not.toHaveBeenCalled();
		expect(mocks.execute).not.toHaveBeenCalled();
	});
	it('refuses nonexistent projects and missing project ids', async () => {
		await expect(GET(event(''))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 400);
		mocks.exists.mockResolvedValue(false);
		await expect(GET(event('projectId=ghost'))).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 404);
		expect(mocks.execute).not.toHaveBeenCalled();
	});
});
