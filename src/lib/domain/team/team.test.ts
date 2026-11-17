import { describe, expect, it } from 'vitest';
import {
	administersProject,
	canDeleteProject,
	canSeeProjectAsCollaborator,
	emptyTeam,
	sameEmail,
	type Collaborator,
	type Team,
} from './team';

function collaborator(overrides: Partial<Collaborator> = {}): Collaborator {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		name: overrides.name ?? 'Ada Lovelace',
		email: overrides.email ?? 'ada@company.com',
		color: overrides.color ?? 'violet',
		role: overrides.role ?? 'contributor',
		seniority: overrides.seniority ?? 'ic',
		expertise: overrides.expertise ?? [],
		scope: overrides.scope ?? [],
		joinedAt: overrides.joinedAt ?? '2026-07-14T00:00:00.000Z',
	};
}

function teamOf(...collaborators: Collaborator[]): Team {
	return { collaborators };
}

describe('sameEmail', () => {
	it('matches case- and whitespace-insensitively', () => {
		expect(sameEmail('Ada@Company.com', '  ada@company.com ')).toBe(true);
	});

	it('never matches when either side is empty', () => {
		expect(sameEmail('', 'ada@company.com')).toBe(false);
		expect(sameEmail('ada@company.com', '')).toBe(false);
		expect(sameEmail('   ', '   ')).toBe(false);
	});

	it('rejects different emails', () => {
		expect(sameEmail('ada@company.com', 'grace@company.com')).toBe(false);
	});

	it('never matches null/undefined (back rows may omit email)', () => {
		expect(sameEmail(undefined, 'ada@company.com')).toBe(false);
		expect(sameEmail('ada@company.com', null)).toBe(false);
		expect(sameEmail(undefined, undefined)).toBe(false);
	});
});

describe('canSeeProjectAsCollaborator', () => {
	it('grants when the email is on the team (case-insensitive)', () => {
		const team = teamOf(collaborator({ email: 'Ada@Company.com' }));
		expect(canSeeProjectAsCollaborator(team, 'ada@company.com')).toBe(true);
	});

	it('denies when the email is not on the team', () => {
		const team = teamOf(collaborator({ email: 'ada@company.com' }));
		expect(canSeeProjectAsCollaborator(team, 'grace@company.com')).toBe(false);
	});

	it('denies for an empty team', () => {
		expect(canSeeProjectAsCollaborator(emptyTeam(), 'ada@company.com')).toBe(false);
	});

	it('denies for a missing caller email', () => {
		const team = teamOf(collaborator({ email: 'ada@company.com' }));
		expect(canSeeProjectAsCollaborator(team, null)).toBe(false);
		expect(canSeeProjectAsCollaborator(team, undefined)).toBe(false);
		expect(canSeeProjectAsCollaborator(team, '')).toBe(false);
	});

	it('ignores collaborators with no email (attribution-only rows)', () => {
		const team = teamOf(collaborator({ email: '' }), collaborator({ email: 'ada@company.com' }));
		expect(canSeeProjectAsCollaborator(team, '')).toBe(false);
		expect(canSeeProjectAsCollaborator(team, 'ada@company.com')).toBe(true);
	});
});

describe('canDeleteProject', () => {
	it('reserves deletion to the owner once one is specified', () => {
		const team = teamOf(
			collaborator({ role: 'owner', email: 'Ada@Company.com' }),
			collaborator({ role: 'contributor', email: 'grace@company.com' }),
		);
		expect(canDeleteProject(team, 'ada@company.com')).toBe(true);
		expect(canDeleteProject(team, 'grace@company.com')).toBe(false);
		expect(canDeleteProject(team, null)).toBe(false);
	});

	it('accepts any of several owners', () => {
		const team = teamOf(
			collaborator({ role: 'owner', email: 'ada@company.com' }),
			collaborator({ role: 'owner', email: 'grace@company.com' }),
		);
		expect(canDeleteProject(team, 'grace@company.com')).toBe(true);
	});

	it('leaves deletion open when no owner is specified', () => {
		expect(canDeleteProject(emptyTeam(), null)).toBe(true);
		const ownerless = teamOf(collaborator({ role: 'contributor', email: 'grace@company.com' }));
		expect(canDeleteProject(ownerless, 'someone-else@company.com')).toBe(true);
	});
});

describe('who administers a project [criterion:ac-leaf-ac-proj-settings]', () => {
	const team: Team = { collaborators: [collaborator({ email: 'owner@acme.io', role: 'owner' }), collaborator({ email: 'dev@acme.io', role: 'contributor' })] };

	it('is an admin or the owner of the workspace, whatever the project', () => {
		expect(administersProject('admin', emptyTeam(), 'anyone@acme.io')).toBe(true);
		expect(administersProject('owner', emptyTeam(), 'anyone@acme.io')).toBe(true);
	});

	it('is the project owner among the others, matched by email', () => {
		expect(administersProject('member', team, 'Owner@Acme.io')).toBe(true);
		expect(administersProject('member', team, 'dev@acme.io')).toBe(false);
		expect(administersProject(null, team, null)).toBe(false);
	});

	it('is nobody else when the project names no owner', () => {
		expect(administersProject('member', emptyTeam(), 'dev@acme.io')).toBe(false);
	});
});
