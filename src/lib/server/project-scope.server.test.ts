import { describe, expect, it } from 'vitest';
import type { CallerReach } from '$application/portfolio/project-visibility';
import type { BackProjectLink } from '$application/ports';
import type { Collaborator, Team } from '$domain/team';
import { callerCanSeeProject } from './project-scope.server';
import { requestEvent, servicesWith, type FakeServices } from './request-event.fixture';

/**
 * Who may open one project, on top of being a member of its workspace: the
 * folders the caller reaches IN THE WORKSPACE THAT OWNS IT (issue 150), plus the
 * projects whose team names them. Everything here is the real visibility code;
 * only the stores it reads are in memory.
 */

const DANA = 'dana@example.test';

/** The caller's role and folders, workspace by workspace; null folders: every folder. */
function reach(workspaces: Record<string, string[] | null>, email: string | null = DANA): CallerReach {
	return {
		workspaces: new Map(
			Object.entries(workspaces).map(([id, folders]) => [id, { role: folders ? 'designer' : 'admin', folders: folders ? new Set(folders) : null }])
		),
		activeId: Object.keys(workspaces)[0] ?? null,
		email
	};
}

function collaborator(email: string): Collaborator {
	return { id: email, name: email, email, color: 'blue', role: 'contributor', seniority: 'ic', expertise: [], scope: [], joinedAt: '2026-01-01' };
}

interface Catalog {
	/** project id -> the workspace that owns it on the team server. */
	readonly owners?: Record<string, string>;
	/** project id -> its folder. */
	readonly folders?: Record<string, string | null>;
	/** project id -> the emails on its team. */
	readonly teams?: Record<string, string[]>;
	readonly teamReadFails?: boolean;
	readonly metaReadFails?: boolean;
}

function services(callerReach: CallerReach | null, catalog: Catalog = {}, extra: FakeServices = {}) {
	const teamReads: string[] = [];
	const parts: FakeServices = {
		enterpriseHooks: {
			callerReach: async () => callerReach,
			invitationBehind: async () => ({ token: null, invitation: null }),
			settingsMembers: async () => null,
			settingsReclaim: async () => null
		},
		backLinks: {
			find: async (id): Promise<BackProjectLink | null> => {
				const owner = catalog.owners?.[id];
				return owner ? { localProjectId: id, backProjectId: `b-${id}`, backWorkspaceId: owner, status: 'linked' } : null;
			}
		},
		portfolio: {
			getMeta: async (id) => {
				if (catalog.metaReadFails) throw new Error('portfolio store down');
				return { domainId: catalog.folders?.[id] ?? null, shippedAt: null };
			}
		},
		loadTeam: {
			execute: async (id): Promise<Team> => {
				teamReads.push(id);
				if (catalog.teamReadFails) throw new Error('team server down');
				return { collaborators: (catalog.teams?.[id] ?? []).map(collaborator) };
			}
		},
		...extra
	};
	return { services: servicesWith(parts), teamReads };
}

function signedIn(svc: ReturnType<typeof services>['services'], authRequired = true) {
	return requestEvent({ authRequired, services: svc, session: { isAuthenticated: true, email: DANA } });
}

const ACME = { owners: { 'p-billing': 'ws-acme', 'p-hr': 'ws-acme' }, folders: { 'p-billing': 'f-finance', 'p-hr': 'f-people' } };

describe('who may open a project', () => {
	it('lets an owner or administrator of the owning workspace open every project in it', async () => {
		const { services: svc, teamReads } = services(reach({ 'ws-acme': null }), ACME);
		expect(await callerCanSeeProject(signedIn(svc), 'p-billing')).toBe(true);
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(true);
		expect(teamReads).toEqual([]);
	});

	it('lets a member open the projects of the folders they reach, and no other', async () => {
		const { services: svc } = services(reach({ 'ws-acme': ['f-finance'] }), ACME);
		expect(await callerCanSeeProject(signedIn(svc), 'p-billing')).toBe(true);
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(false);
	});

	it('lets a member open a project outside their folders when its team names them', async () => {
		const { services: svc } = services(reach({ 'ws-acme': ['f-finance'] }), { ...ACME, teams: { 'p-hr': ['DANA@Example.test'] } });
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(true);
	});

	it('hides a project of a workspace the caller is not a member of, even from someone who administers another', async () => {
		const { services: svc } = services(reach({ 'ws-own': null }), { owners: { 'p-secret': 'ws-other' }, folders: { 'p-secret': 'f-x' } });
		expect(await callerCanSeeProject(signedIn(svc), 'p-secret')).toBe(false);
	});

	it('reads the folders in the workspace that owns the project, not in the one the switcher shows', async () => {
		// Administrator of the active workspace, restricted in the one that owns the project.
		const { services: svc } = services(reach({ 'ws-mine': null, 'ws-acme': ['f-finance'] }), ACME);
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(false);
		expect(await callerCanSeeProject(signedIn(svc), 'p-billing')).toBe(true);
	});

	it('hides a project filed in no folder from a member restricted to folders', async () => {
		const { services: svc } = services(reach({ 'ws-acme': ['f-finance'] }), { owners: { 'p-loose': 'ws-acme' }, folders: { 'p-loose': null } });
		expect(await callerCanSeeProject(signedIn(svc), 'p-loose')).toBe(false);
	});

	it('fails closed when the team server cannot say who is on the project', async () => {
		const { services: svc } = services(reach({ 'ws-acme': ['f-finance'] }), { ...ACME, teams: { 'p-hr': [DANA] }, teamReadFails: true });
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(false);
	});

	it('falls back to the team alone when the project folder cannot be read', async () => {
		const named = services(reach({ 'ws-acme': ['f-finance'] }), { ...ACME, metaReadFails: true, teams: { 'p-billing': [DANA] } });
		expect(await callerCanSeeProject(signedIn(named.services), 'p-billing')).toBe(true);
		const unnamed = services(reach({ 'ws-acme': ['f-finance'] }), { ...ACME, metaReadFails: true });
		expect(await callerCanSeeProject(signedIn(unnamed.services), 'p-billing')).toBe(false);
	});

	it('gives no per-project grant to a caller without an email', async () => {
		const { services: svc } = services(reach({ 'ws-acme': ['f-finance'] }, null), { ...ACME, teams: { 'p-hr': [''] } });
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(false);
	});
});

describe('installations where nothing is scoped', () => {
	it('opens every project with sign-in off, without reading any store', async () => {
		const event = requestEvent({ authRequired: false, services: servicesWith({}) });
		expect(await callerCanSeeProject(event, 'p-any')).toBe(true);
	});

	it('opens every project on the open-source build, which has no Enterprise hooks', async () => {
		const event = requestEvent({ authRequired: true, services: servicesWith({ enterpriseHooks: null }) });
		expect(await callerCanSeeProject(event, 'p-any')).toBe(true);
	});

	it('opens every project when the Enterprise hooks scope nothing for this caller', async () => {
		const { services: svc } = services(null, ACME);
		expect(await callerCanSeeProject(signedIn(svc), 'p-hr')).toBe(true);
	});
});
