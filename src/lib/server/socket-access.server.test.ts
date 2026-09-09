import { beforeEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ access: vi.fn(), shared: vi.fn(), features: vi.fn() }));
vi.mock('./project-access.server', () => ({ requireProjectAccess: deps.access }));
vi.mock('./shared-editor-access.server', () => ({ canUseSharedEditor: deps.shared }));
vi.mock('$composition/container.server', () => ({ getServices: () => ({ loadFeaturesDraft: { execute: deps.features } }) }));
import { authorizeSocket } from './socket-access.server';
const event = {} as never;
beforeEach(() => {
	vi.resetAllMocks();
	deps.access.mockResolvedValue(undefined);
	deps.features.mockResolvedValue({ features: [{ id: 'feature-1' }] });
});
describe('socket authorization', () => {
	it('requires write permission for the requested project and a feature belonging to it', async () => {
		expect(await authorizeSocket(event, '/yjs/feature:feature-1?project=project-a')).toBe('/yjs/project-a:feature:feature-1');
		expect(deps.access).toHaveBeenCalledWith(event, 'project-a', 'write');
		deps.access.mockRejectedValueOnce(new Error('forbidden'));
		await expect(authorizeSocket(event, '/yjs/feature:feature-1?project=project-b')).rejects.toThrow('forbidden');
		await expect(authorizeSocket(event, '/yjs/feature:foreign?project=project-a')).rejects.toMatchObject({ status: 404 });
	});
	it('namespaces identical feature ids by project', async () => {
		expect(await authorizeSocket(event, '/yjs/feature:feature-1?project=project-a')).not.toBe(await authorizeSocket(event, '/yjs/feature:feature-1?project=project-b'));
	});
	it('rejects missing project scope, traversal and unsupported rooms', async () => {
		for (const path of ['/yjs/feature:feature-1', '/yjs/feature:feature-1?project=../x', '/yjs/project:p?project=p', '//evil.example/yjs/feature:f', '/behavior/sync/feature:..%2Fx']) {
			await expect(authorizeSocket(event, path)).rejects.toMatchObject({ status: 400 });
		}
	});
	it('reserves the global behavior store for the shared-editor policy', async () => {
		deps.shared.mockReturnValue(false);
		await expect(authorizeSocket(event, '/behavior/sync/feature:feature-1')).rejects.toMatchObject({ status: 403 });
		deps.shared.mockReturnValue(true);
		expect(await authorizeSocket(event, '/behavior/sync/feature:feature-1')).toBe('/behavior/sync/feature:feature-1');
	});
});
