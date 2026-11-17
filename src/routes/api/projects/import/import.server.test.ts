import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error, isHttpError } from '@sveltejs/kit';
import type { ImportProjectPolicy } from '$application/use-cases/portability/import-project';
import { currentRequestWorkspace } from '$lib/server/request-context.server';

const access = vi.hoisted(() => vi.fn(async () => {}));
const ownership = vi.hoisted(() => ({
	resolve: vi.fn(async () => ({ id: 'new-team', name: 'New team', role: 'designer' })),
	own: vi.fn(async () => {})
}));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: access }));
vi.mock('$lib/server/new-project-ownership.server', () => ({
	resolveOwningWorkspace: ownership.resolve,
	ownNewProject: ownership.own,
	VIEWER_CREATION_REFUSAL: 'Only an owner, admin or designer of the workspace can create a project.'
}));

const { POST } = await import('./+server');

function harness(options: { existing?: boolean; workspaceId?: string; authRequired?: boolean } = {}) {
	const writes: string[] = [];
	const mirror = vi.fn(async () => {});
	const services = {
		identity: { multiUser: true },
		backLinks: { find: async () => ({ backWorkspaceId: 'existing-team' }) },
		importProject: {
			execute: async (_input: unknown, policy: ImportProjectPolicy) => policy.withTarget({
				projectId: 'target', existing: options.existing ?? true
			}, async () => {
				writes.push(currentRequestWorkspace() ?? 'standalone');
				return { ok: true, projectId: 'target', name: 'Target', warnings: [] };
			})
		},
		scheduleBackSync: mirror,
		audit: { record: vi.fn() }
	};
	const url = new URL('http://localhost/api/projects/import?mode=restore&overwrite=true');
	if (options.workspaceId) url.searchParams.set('workspaceId', options.workspaceId);
	const event = {
		url,
		request: new Request(url, { method: 'POST', body: new Uint8Array([1]) }),
		locals: { services, authRequired: options.authRequired ?? true, session: { email: 'reader@example.test' } },
		cookies: { get: () => 'token' }
	};
	return { run: () => POST(event as never), writes, mirror };
}

describe('project restore access and ownership', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('refuses an unauthorized overwrite before writing [unspa:b07d5221:5583b274:29f7e5c3]', async () => {
		access.mockImplementationOnce(async () => error(403, 'forbidden'));
		const h = harness();
		await expect(h.run()).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 403);
		expect(h.writes).toEqual([]);
		expect(ownership.own).not.toHaveBeenCalled();
		expect(h.mirror).not.toHaveBeenCalled();
	});

	it('keeps an existing target in its own workspace without granting a new owner', async () => {
		const h = harness();
		expect(await (await h.run()).json()).toMatchObject({ projectId: 'target', workspaceId: 'existing-team' });
		expect(access).toHaveBeenCalledWith(expect.anything(), 'target', 'write');
		expect(h.writes).toEqual(['existing-team']);
		expect(ownership.resolve).not.toHaveBeenCalled();
		expect(ownership.own).not.toHaveBeenCalled();
	});

	it('refuses moving an existing target into a different requested team', async () => {
		const h = harness({ workspaceId: 'new-team' });
		await expect(h.run()).rejects.toSatisfy((e: unknown) => isHttpError(e) && e.status === 403);
		expect(h.writes).toEqual([]);
		expect(ownership.own).not.toHaveBeenCalled();
	});

	it('establishes ownership only for a new project before mirroring it', async () => {
		const h = harness({ existing: false });
		await h.run();
		expect(access).not.toHaveBeenCalled();
		expect(h.writes).toEqual(['new-team']);
		expect(ownership.own).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'target', 'project.import');
		expect(h.mirror).toHaveBeenCalledWith('target');
	});

	it('refuses a viewer of the owning workspace a new project, as creating one does [unspa:b07d5221:5583b274:fd240a21]', async () => {
		ownership.resolve.mockImplementationOnce(async () => ({ id: 'new-team', name: 'New team', role: 'viewer' }));
		const h = harness({ existing: false });
		await expect(h.run()).rejects.toSatisfy(
			(e: unknown) => isHttpError(e) && e.status === 403 && e.body.message === 'Only an owner, admin or designer of the workspace can create a project.'
		);
		expect(h.writes).toEqual([]);
		expect(ownership.own).not.toHaveBeenCalled();
	});
});
