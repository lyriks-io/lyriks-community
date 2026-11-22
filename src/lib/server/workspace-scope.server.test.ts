import { describe, expect, it } from 'vitest';
import type { WorkspaceSummary } from '$application/ports';
import { callerWorkspaceScope } from './workspace-scope.server';
import { requestEvent, servicesWith } from './request-event.fixture';

/** The workspaces whose projects a catalog listing may show the caller. */

function caller(opts: { authRequired: boolean; multiUser?: boolean; workspaces?: WorkspaceSummary[] | 'unreachable' }) {
	return requestEvent({
		authRequired: opts.authRequired,
		services: servicesWith({
			identity: { multiUser: opts.multiUser ?? true },
			workspaces: {
				listForCaller: async () => {
					if (opts.workspaces === 'unreachable') throw new Error('team server down');
					return opts.workspaces ?? [];
				}
			}
		})
	});
}

describe('the workspaces a listing is scoped to', () => {
	it('are the ones the team server says the caller belongs to', async () => {
		const workspaces: WorkspaceSummary[] = [
			{ id: 'ws-acme', name: 'Acme', role: 'designer' },
			{ id: 'ws-own', name: 'Mine', role: 'owner' }
		];
		expect(await callerWorkspaceScope(caller({ authRequired: true, workspaces }))).toEqual(new Set(['ws-acme', 'ws-own']));
	});

	it('are none when the team server cannot answer, so a listing leaks no tenant', async () => {
		expect(await callerWorkspaceScope(caller({ authRequired: true, workspaces: 'unreachable' }))).toEqual(new Set());
	});

	it('are not scoped with sign-in off', async () => {
		expect(await callerWorkspaceScope(caller({ authRequired: false, workspaces: 'unreachable' }))).toBeNull();
	});

	it('are not scoped on a single-operator installation, which has no teams', async () => {
		expect(await callerWorkspaceScope(caller({ authRequired: true, multiUser: false, workspaces: 'unreachable' }))).toBeNull();
	});
});
