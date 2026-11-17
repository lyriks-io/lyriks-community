import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { BackHttpError } from '$application/ports';

/**
 * Home's "Create workspace" form (action 72e8f96b): an administrator of the
 * installation who administers no workspace while workspaces already exist is
 * offered the form (criterion cce05833), and the team server refuses them
 * (rule 02adbadd). Home then shows the team server's reason, never a "try
 * again" that cannot succeed (scenario 6f58ffba).
 */

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

const audits: { action: string; outcome: string; detail?: string }[] = [];
const createForCaller = vi.fn(async (_name: string): Promise<unknown> => null);

const { actions } = await import('./+page.server');

function event(name: string) {
	const body = new FormData();
	body.set('name', name);
	const cookies = new Map<string, string>();
	return {
		request: new Request('http://localhost/?/createWorkspace', { method: 'POST', body }),
		cookies: { set: (key: string, value: string) => cookies.set(key, value), get: (key: string) => cookies.get(key) },
		locals: {
			authRequired: true,
			session: { email: 'admin@example.test' },
			license: null,
			services: { workspaces: { createForCaller }, audit: { record: (entry: (typeof audits)[number]) => audits.push(entry) } }
		},
		pinned: cookies
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const create = (e: ReturnType<typeof event>) => (actions.createWorkspace as any)(e as unknown as RequestEvent);

beforeEach(() => {
	env.LYRIKS_ADMIN_EMAILS = 'admin@example.test';
	audits.length = 0;
	createForCaller.mockReset();
});

afterEach(() => {
	for (const key of Object.keys(env)) delete env[key];
});

describe('Create a workspace from Home', () => {
	it("shows the team server's reason when it refuses an administrator who administers no workspace", async () => {
		createForCaller.mockRejectedValueOnce(new BackHttpError(403, 'only an administrator may create a workspace; ask yours to invite you to one'));
		const result = await create(event('Acme'));
		expect(result.status).toBe(403);
		expect(result.data).toEqual({ scope: 'workspace', message: 'Only an administrator may create a workspace; ask yours to invite you to one.' });
		expect(audits).toEqual([expect.objectContaining({ action: 'workspace.create', outcome: 'failure', detail: 'Only an administrator may create a workspace; ask yours to invite you to one.' })]);
	});

	it('asks to try again when the team server does not take the workspace', async () => {
		const result = await create(event('Acme'));
		expect(result.status).toBe(502);
		expect(result.data).toEqual({ scope: 'workspace', message: 'Could not create your workspace. Please try again.' });
	});

	it('pins the workspace founded as the active team', async () => {
		createForCaller.mockResolvedValueOnce({ id: 'ws-new', name: 'Acme', role: 'admin' });
		const e = event('Acme');
		expect(await create(e)).toEqual({ created: 'workspace' });
		expect(e.pinned.get('lyriks_active_ws')).toBe('ws-new');
	});
});
