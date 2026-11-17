import { describe, expect, it, vi } from 'vitest';
import { retrospecActor } from './retrospec-status.server';
import { discussionAuthor } from './spec360-discussions.server';
import { callerNameForProject } from './caller-workspace.server';

/**
 * The acting person's name on a project page is read in the workspace that
 * owns the project, never in the one the switcher shows (criterion dcaffd36).
 */
const names: Record<string, string> = { 'ws-owning': 'Carmen Ruiz', 'ws-active': 'Carmen (other team)' };

function services(owning: string | null) {
	return {
		currentSession: () => ({ email: 'carmen@company.test', isAuthenticated: true }),
		backLinks: { find: async () => (owning ? { backWorkspaceId: owning } : null) },
		resolveActiveMemberName: { execute: vi.fn(async (workspaceId: string | null) => (workspaceId ? names[workspaceId] ?? '' : '')) }
	} as never;
}

const cookies = { get: (name: string) => (name === 'lyriks_active_ws' ? 'ws-active' : undefined) };

describe('the name of the person acting on a project', () => {
	it('is their member name in the workspace that owns the project', async () => {
		expect(await callerNameForProject(services('ws-owning'), 'p', 'ws-active')).toBe('Carmen Ruiz');
		expect(await retrospecActor(services('ws-owning'), 'p', cookies)).toEqual({ id: 'carmen@company.test', name: 'Carmen Ruiz' });
		expect(await discussionAuthor(services('ws-owning'), 'p', cookies)).toEqual({ email: 'carmen@company.test', name: 'Carmen Ruiz' });
	});

	it('is read in the workspace the switcher shows for a project that belongs to none', async () => {
		expect(await retrospecActor(services(null), 'p', cookies)).toEqual({ id: 'carmen@company.test', name: 'Carmen (other team)' });
		expect(await discussionAuthor(services(null), 'p', cookies)).toEqual({ email: 'carmen@company.test', name: 'Carmen (other team)' });
	});

	it('falls back to the email when no name can be read', async () => {
		const failing = { ...(services('ws-owning') as object), resolveActiveMemberName: { execute: async () => { throw new Error('down'); } } } as never;
		expect(await retrospecActor(failing, 'p', cookies)).toEqual({ id: 'carmen@company.test', name: 'carmen@company.test' });
	});
});
