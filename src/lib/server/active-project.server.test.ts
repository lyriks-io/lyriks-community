import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { ActiveProjectState } from '$application/portfolio/active-project';
import { inactiveProjectResponse, requireActiveProject } from './active-project.server';

function localsOf(edition: string | undefined, state: ActiveProjectState | null) {
	let reads = 0;
	const locals = {
		services: {
			installEdition: () => edition,
			resolveActiveProject: { execute: async () => (reads++, state) }
		}
	} as unknown as App.Locals;
	return { locals, reads: () => reads };
}

const MOVED_DOWN: ActiveProjectState = { activeProjectIds: ['b'], projectCount: 3, granted: 1 };
/** An Enterprise key that grants 2 projects on an installation holding 3 (EVO-016). */
const TWO_OF_THREE: ActiveProjectState = { activeProjectIds: ['b', 'c'], projectCount: 3, granted: 2 };

describe('requireActiveProject (EVO-001, feat 128)', () => {
	it('refuses an inactive project with a 403 the error page offers to lift', async () => {
		const { locals } = localsOf('community', MOVED_DOWN);
		const refusal = await requireActiveProject({ locals }, 'a').catch((e: unknown) => e);
		expect(isHttpError(refusal, 403)).toBe(true);
		expect(isHttpError(refusal) && refusal.body).toMatchObject({ inactiveProjectId: 'a' });
	});

	it('opens the active one, and reads the state once per request', async () => {
		const { locals, reads } = localsOf('community', MOVED_DOWN);
		await requireActiveProject({ locals }, 'b');
		await requireActiveProject({ locals }, 'b');
		expect(reads()).toBe(1);
	});

	it('holds shut the projects beyond the N a key grants, naming N for the error page [criterion:ac-leaf-e00f8726-ec61-4b51-b8f6-a32794c70c36]', async () => {
		const { locals } = localsOf('enterprise', TWO_OF_THREE);
		const refusal = await requireActiveProject({ locals }, 'a').catch((e: unknown) => e);
		expect(isHttpError(refusal, 403)).toBe(true);
		expect(isHttpError(refusal) && refusal.body).toMatchObject({ inactiveProjectId: 'a', activeProjectsGranted: 2 });
		await expect(requireActiveProject({ locals }, 'c')).resolves.toBeUndefined();
	});

	it('opens every project where the key grants every project', async () => {
		const { locals } = localsOf('enterprise', null);
		await expect(requireActiveProject({ locals }, 'a')).resolves.toBeUndefined();
	});
});

describe('inactiveProjectResponse', () => {
	const event = (locals: App.Locals, path: string, projectId?: string) =>
		({ locals, params: projectId ? { projectId } : {}, url: new URL(`http://x${path}`) }) as Parameters<typeof inactiveProjectResponse>[0];

	it('answers an API call on an inactive project with a JSON 403', async () => {
		const { locals } = localsOf('community', MOVED_DOWN);
		const res = await inactiveProjectResponse(event(locals, '/api/projects/a/features', 'a'));
		expect(res?.status).toBe(403);
		expect(await res?.json()).toMatchObject({ inactiveProjectId: 'a' });
	});

	it('leaves pages, the active project and paths without a project alone', async () => {
		const { locals } = localsOf('community', MOVED_DOWN);
		expect(await inactiveProjectResponse(event(locals, '/projects/a/spec', 'a'))).toBeNull();
		expect(await inactiveProjectResponse(event(locals, '/api/projects/b/features', 'b'))).toBeNull();
		expect(await inactiveProjectResponse(event(locals, '/api/active-project'))).toBeNull();
	});
});
