import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { resolveOwningWorkspace } from './new-project-ownership.server';

const teams = [
	{ id: 'ws-a', name: 'A', role: 'designer' },
	{ id: 'ws-b', name: 'B', role: 'viewer' }
];
const services = { identity: { multiUser: true }, workspaces: { listForCaller: async () => teams } } as never;
const locals = { authRequired: true } as never;

const refusal = async (run: Promise<unknown>) => {
	try {
		await run;
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, message: e.body.message };
		throw e;
	}
	return null;
};

describe('resolveOwningWorkspace: which workspace owns a new project', () => {
	it('takes the workspace the switcher pinned when the request names none (issue 108) [scenario:437c2fde]', async () => {
		expect((await resolveOwningWorkspace(services, locals, { requested: null, pinned: 'ws-b' }))?.id).toBe('ws-b');
	});

	it('takes the folder\'s workspace before the switcher\'s (the panel\'s + Project)', async () => {
		expect((await resolveOwningWorkspace(services, locals, { requested: null, folderWorkspaceId: 'ws-a', pinned: 'ws-b' }))?.id).toBe('ws-a');
	});

	it('still asks an AI client of several workspaces to name one [rule:fb69bf09]', async () => {
		expect(await refusal(resolveOwningWorkspace(services, locals, { requested: null }))).toEqual({
			status: 400,
			message: 'workspaceId is required when you belong to more than one workspace.'
		});
	});

	it('ignores a pinned workspace the caller is not in, and refuses a named one [rule:688f91fe]', async () => {
		expect(await refusal(resolveOwningWorkspace(services, locals, { requested: null, pinned: 'ws-x' }))).toMatchObject({ status: 400 });
		expect(await refusal(resolveOwningWorkspace(services, locals, { requested: 'ws-x' }))).toEqual({ status: 403, message: 'You are not a member of that workspace.' });
	});

	it('carries the caller\'s role in the owning workspace', async () => {
		expect((await resolveOwningWorkspace(services, locals, { requested: 'ws-b' }))?.role).toBe('viewer');
	});
});
