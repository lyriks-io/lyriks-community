import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

import { BackHttpError } from '$application/ports';
import { foundWorkspace, mayFoundWorkspace } from './workspace-founding.server';

type Locals = Parameters<typeof mayFoundWorkspace>[0]['locals'];
const caller = (email: string | null, authRequired = true) => ({
	locals: { authRequired, session: email ? { email } : null, license: null } as unknown as Locals
});

afterEach(() => {
	for (const key of Object.keys(env)) delete env[key];
});

describe('who may found a workspace from Home', () => {
	it('sends a person who administers nothing to their administrator [rule:d510efdd]', () => {
		expect(mayFoundWorkspace(caller('member@example.test'))).toBe(false);
	});

	it('lets an administrator of the installation found one', () => {
		env.LYRIKS_ADMIN_EMAILS = 'admin@example.test';
		expect(mayFoundWorkspace(caller('admin@example.test'))).toBe(true);
	});

	it('lets anyone found one where the operator allowed self-provisioning', () => {
		env.LYRIKS_AUTO_WORKSPACE = '1';
		expect(mayFoundWorkspace(caller('member@example.test'))).toBe(true);
	});

	it('refuses nothing without sign-in, where there are no teams', () => {
		expect(mayFoundWorkspace(caller(null, false))).toBe(true);
	});
});

describe('founding a workspace on the team server', () => {
	const founding = (createForCaller: () => Promise<unknown>) => foundWorkspace({ workspaces: { createForCaller } } as never, 'Acme');

	it('answers the workspace founded', async () => {
		const created = { id: 'ws-new', name: 'Acme', role: 'admin' };
		expect(await founding(async () => created)).toEqual({ created });
	});

	it("words the team server's refusal of the founder as a sentence [rule:02adbadd]", async () => {
		const refusal = new BackHttpError(403, 'only an administrator may create a workspace; ask yours to invite you to one');
		expect(await founding(async () => { throw refusal; })).toEqual({ refused: 'Only an administrator may create a workspace; ask yours to invite you to one.' });
		const seats = new BackHttpError(403, 'this licence permits 5 member(s) on this installation, and every seat is taken. A larger Enterprise licence is required to add more.');
		expect(await founding(async () => { throw seats; })).toEqual({ refused: 'This licence permits 5 member(s) on this installation, and every seat is taken. A larger Enterprise licence is required to add more.' });
	});

	it('answers null for anything else the team server does not take [rule:a78bf687]', async () => {
		expect(await founding(async () => null)).toBeNull();
	});

	it('lets any other error through', async () => {
		await expect(founding(async () => { throw new BackHttpError(500, 'boom'); })).rejects.toMatchObject({ status: 500 });
	});
});
