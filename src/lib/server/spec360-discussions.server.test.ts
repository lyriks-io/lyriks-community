import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { discussionRoster } from './spec360-discussions.server';

const cookies = { get: () => undefined } as unknown as Cookies;

/** A Back whose answers are released by hand, to see which reads are asked before any answer comes. */
function back() {
	const asked: string[] = [];
	const pending: (() => void)[] = [];
	const later = <T>(name: string, value: T) =>
		new Promise<T>((resolve) => {
			asked.push(name);
			pending.push(() => resolve(value));
		});
	const services = {
		currentSession: () => ({ email: 'ada@lyriks.io' }),
		backLinks: { find: async () => ({ backWorkspaceId: 'ws-1' }) },
		loadTeam: {
			execute: () =>
				later('team', { collaborators: [{ email: 'Grace@Lyriks.io', name: 'Grace Hopper', expertise: ['engineering'], seniority: 'senior' }] })
		},
		workspaces: {
			listForCaller: () => later('workspaces', [{ id: 'ws-1' }]),
			listMembers: () => later('members', [
				{ email: 'grace@lyriks.io', name: 'Grace Brewster Hopper' },
				{ email: 'alan@lyriks.io', name: 'Alan Turing' }
			])
		},
		teamJobs: { forProject: () => later('jobs', new Map([['alan@lyriks.io', { jobIds: ['j1'], names: ['Architect'] }]])) }
	} as unknown as AppServices;
	const releaseAll = async () => {
		while (pending.length > 0 || asked.length < 4) {
			pending.splice(0).forEach((release) => release());
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	};
	return { services, asked, releaseAll };
}

describe('discussionRoster', () => {
	it("asks the Back for the project's team and the workspace together, and still names the team first", async () => {
		const { services, asked, releaseAll } = back();
		const roster = discussionRoster(services, 'p-roster', cookies);
		await new Promise((resolve) => setTimeout(resolve, 0));
		// Both first reads are out before either answered.
		expect(asked).toEqual(expect.arrayContaining(['team', 'workspaces']));
		await releaseAll();
		expect(await roster).toEqual([
			{ email: 'alan@lyriks.io', name: 'Alan T.', job: 'Architect' },
			// The team's name and job win over the workspace's.
			{ email: 'grace@lyriks.io', name: 'Grace H.', job: 'Dev' }
		]);
	});
});
