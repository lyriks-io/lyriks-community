import { describe, expect, it } from 'vitest';
import { isProjectVisible, seesEverything, type ProjectVisibility } from './project-visibility';
import { emptyTeam, type Collaborator, type Team } from '$domain/team/team';

function teamWith(email: string): Team {
	const c: Collaborator = {
		id: 'c1',
		name: 'Member',
		email,
		color: 'violet',
		role: 'contributor',
		seniority: 'ic',
		expertise: [],
		scope: [],
		joinedAt: '2026-07-14T00:00:00.000Z',
	};
	return { collaborators: [c] };
}

const noTeam = async () => emptyTeam();

describe('seesEverything', () => {
	it('is true only for blanket (null domains)', () => {
		expect(seesEverything({ allowedDomainIds: null, email: 'a@b.com' })).toBe(true);
		expect(seesEverything({ allowedDomainIds: new Set(), email: 'a@b.com' })).toBe(false);
	});
});

describe('isProjectVisible', () => {
	it('blanket visibility sees every project without loading teams', async () => {
		const v: ProjectVisibility = { allowedDomainIds: null, email: null };
		expect(await isProjectVisible('p1', 'd-any', v, noTeam)).toBe(true);
		expect(await isProjectVisible('p2', null, v, noTeam)).toBe(true);
	});

	it('restricted: visible when the project domain is in breadth', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(['d1']), email: 'ada@co.com' };
		expect(await isProjectVisible('p1', 'd1', v, noTeam)).toBe(true);
	});

	it('restricted: visible when a collaborator even if the domain is out of breadth', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(['d1']), email: 'ada@co.com' };
		const getTeam = async () => teamWith('ada@co.com');
		expect(await isProjectVisible('p2', 'd2', v, getTeam)).toBe(true);
	});

	it('restricted: hidden when neither in breadth nor a collaborator', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(['d1']), email: 'ada@co.com' };
		const getTeam = async () => teamWith('someone@co.com');
		expect(await isProjectVisible('p2', 'd2', v, getTeam)).toBe(false);
	});

	it('restricted with empty breadth: only collaborator projects (pure per-project member)', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(), email: 'ada@co.com' };
		expect(await isProjectVisible('p1', 'd1', v, async () => teamWith('ada@co.com'))).toBe(true);
		expect(await isProjectVisible('p2', 'd2', v, async () => teamWith('other@co.com'))).toBe(false);
	});

	it('restricted with no email: sees nothing outside breadth', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(['d1']), email: null };
		expect(await isProjectVisible('p1', 'd1', v, noTeam)).toBe(true);
		expect(await isProjectVisible('p2', 'd2', v, async () => teamWith('ada@co.com'))).toBe(false);
	});

	it('fails closed when the team cannot be loaded', async () => {
		const v: ProjectVisibility = { allowedDomainIds: new Set(), email: 'ada@co.com' };
		const boom = async () => {
			throw new Error('back down');
		};
		expect(await isProjectVisible('p1', 'd2', v, boom)).toBe(false);
	});
});
