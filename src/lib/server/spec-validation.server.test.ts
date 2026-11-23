import { forgetShortMemos } from '$lib/server/short-memo.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRetrospecDocument } from '$domain/retrospec';
import type { TeamJobsPort } from '$application/ports';
vi.mock('$application/retrospec/retrospec-store', () => ({ loadRetrospecDocument: async () => ({ doc: emptyRetrospecDocument(), revision: 1 }) }));
vi.mock('./spec-elements.server', () => ({ readSpecElements: async () => [{ id: 'stack:a', title: 'Stack', owner: 'tech' }] }));
const { readSpecValidationBoard, readSpecValidationSources, readValidationGuards, readValidationTeam } = await import('./spec-validation.server');

function services(participants: NonNullable<TeamJobsPort['participantsForProject']> = async () => [{ email: 'tech@company.test', name: 'Tech Person', jobIds: ['tech'], names: ['Tech'] }]) {
	return {
		identity: { multiUser: true },
		currentSession: () => ({ email: 'reader@company.test' }),
		backLinks: { find: async () => ({ backWorkspaceId: 'owning' }) },
		workspaces: { listForCaller: async () => [{ id: 'other' }, { id: 'owning' }] },
		teamJobs: { participantsForProject: participants },
		loadBaselinesDraft: { execute: async () => ({ baselines: [] }) }
	};
}

describe('the project validation roster', () => {
	beforeEach(() => forgetShortMemos());
	it('reads reachable people and jobs in the owning workspace [criterion:e3296696]', async () => {
		const roster = vi.fn(async () => [{ email: 'Tech@company.test', name: 'Tech Person', jobIds: ['tech'], names: ['Tech'] }] as const);
		expect(await readValidationTeam(services(roster) as never, 'project')).toEqual([{ person: { id: 'tech@company.test', name: 'Tech P.' }, jobIds: ['tech'], jobNames: ['Tech'] }]);
		expect(roster).toHaveBeenCalledWith('owning', 'project');
	});

	it('reports unavailable instead of a smaller team, and refuses mutations503 [criterion:787a9fec]', async () => {
		const unavailable = services(vi.fn(async () => { throw new Error('roster offline'); }));
		const page = await readSpecValidationBoard(unavailable as never, 'project', { id: 'lead@company.test', name: 'Lead' });
		expect(page.teamAvailable).toBe(false);
		expect(page.board.complete).toBe(false);
		await expect(readSpecValidationBoard(unavailable as never, 'project', null, { requireTeam: true })).rejects.toMatchObject({ status: 503 });
	});

	it('keeps single-operator validation available without a team provider [criterion:787a9fec]', async () => {
		const local = { ...services(), identity: { multiUser: false } };
		const page = await readSpecValidationBoard(local as never, 'project', null, { requireTeam: true });
		expect(page.teamAvailable).toBe(true);
		expect(page.team).toEqual([]);
	});
});

describe('the guards the run door shares with Knowledge', () => {
	beforeEach(() => forgetShortMemos());
	it('lets the lead validate, refuses an unknown element and a publication with an element waiting [criterion:6972f3ea]', async () => {
		const operator = { id: 'local-operator', name: 'You' };
		const guards = await readValidationGuards({ ...services(), identity: { multiUser: false } } as never, 'project', operator);
		const doc = emptyRetrospecDocument();
		expect(guards.canReview?.(doc, 'stack:a')).toBe(true);
		expect(guards.canReview?.(doc, 'gone')).toBe(false);
		expect(guards.canPublish?.(doc)).toBe(false);
	});
});

describe('the read ahead after a start', () => {
	beforeEach(() => forgetShortMemos());
	it('reads what the board shares whoever reads it, never the team, which is read as the person reading', async () => {
		const listForCaller = vi.fn(async () => [{ id: 'owning' }]);
		const participants = vi.fn(async () => []);
		const ahead = { ...services(participants), sectionDocuments: { currentRevision: async () => 1 }, workspaces: { listForCaller } };
		await readSpecValidationSources(ahead as never, 'project');
		expect(listForCaller).not.toHaveBeenCalled();
		expect(participants).not.toHaveBeenCalled();
	});
});
