import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import type { CallerReach } from '$application/portfolio/project-visibility';
import { requireProjectAccess } from './project-access.server';
import { requestEvent, servicesWith, type FakeServices } from './request-event.fixture';

/** The gate every project read and write passes, with the real visibility scope behind it. */
function gate(decision: AccessDecision, extra: FakeServices = {}) {
	const tokens: Array<string | null> = [];
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: {
			authorize: async (_projectId, token) => {
				tokens.push(token);
				return decision;
			}
		},
		enterpriseHooks: null,
		...extra
	});
	return { event: requestEvent({ authRequired: true, services, cookies: { lyriks_session: 'jwt-dana' } }), tokens };
}

async function outcome(event: ReturnType<typeof gate>['event']): Promise<number | 'allowed'> {
	return requireProjectAccess(event, 'p-hr', 'write').then(
		() => 'allowed' as const,
		(failure: unknown) => (isHttpError(failure) ? failure.status : Promise.reject(failure))
	);
}

describe('project access response', () => {
	it.each([
		['unauthenticated', 401],
		['forbidden', 403],
		['not_found', 404],
		['unavailable', 503]
	] as const)('reports %s as HTTP %s', async (reason, status) => {
		expect(await outcome(gate({ ok: false, reason }).event)).toBe(status);
	});

	it('asks the access service with the session token the cookie carries', async () => {
		const { event, tokens } = gate({ ok: true });
		expect(await outcome(event)).toBe('allowed');
		expect(tokens).toEqual(['jwt-dana']);
	});

	it('answers 404, as for a non-member, when a member is scoped out of the project folder', async () => {
		const scoped: CallerReach = {
			workspaces: new Map([['ws-acme', { role: 'viewer', folders: new Set(['f-finance']) }]]),
			activeId: 'ws-acme',
			email: 'dana@example.test'
		};
		const { event } = gate(
			{ ok: true },
			{
				enterpriseHooks: {
					callerReach: async () => scoped,
					invitationBehind: async () => ({ token: null, invitation: null }),
					settingsMembers: async () => null,
					settingsReclaim: async () => null
				},
				backLinks: { find: async () => ({ localProjectId: 'p-hr', backProjectId: 'b-hr', backWorkspaceId: 'ws-acme', status: 'linked' }) },
				portfolio: { getMeta: async () => ({ domainId: 'f-people', shippedAt: null }) },
				loadTeam: { execute: async () => ({ collaborators: [] }) }
			}
		);
		expect(await outcome(event)).toBe(404);
	});

	it('checks nothing with sign-in off', async () => {
		const services = servicesWith({ installEdition: () => 'enterprise', resolveActiveProject: { execute: async () => null } });
		expect(await outcome(requestEvent({ authRequired: false, services }))).toBe('allowed');
	});
});
