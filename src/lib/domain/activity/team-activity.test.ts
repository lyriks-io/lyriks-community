import { describe, expect, it } from 'vitest';
import type { Collaborator } from '$domain/team';
import { notificationsFor } from './activity';
import { teamActivity } from './team-activity';

/** Who joined a project's team, as its notifications tell it (criterion 04fb1bbf of feat-feedback-docs). */

const member = (id: string, name: string, email: string, role: Collaborator['role'], joinedAt: string): Collaborator => ({ id, name, email, color: 'slate', role, seniority: 'ic', expertise: [], scope: [], joinedAt });
const team = [
	member('1', 'Carmen Martin', 'carmen@x.io', 'owner', '2026-10-01T09:00:00.000Z'),
	member('2', 'Hugo Bernard', 'hugo@x.io', 'contributor', '2026-10-02T09:00:00.000Z'),
	member('3', 'Léa Moreau', 'lea@x.io', 'reviewer', '2026-11-05T09:00:00.000Z')
];
const read = (runs: readonly { text: string; strong?: boolean }[] | undefined) => (runs ?? []).map((r) => (r.strong ? `**${r.text}**` : r.text)).join('');

describe('the team of a project tells who joined it [criterion:04fb1bbf]', () => {
	const events = teamActivity('tsk', 'Taskora', team);

	it('tells the person added that they were invited, as their role, and nobody tells of the founder', () => {
		const mine = notificationsFor(events, 'lea@x.io');
		expect(mine.map((e) => e.notice?.title)).toEqual(["You've been invited to a project."]);
		expect(read(mine[0].notice?.body)).toBe('You now have access to **Taskora** and its specification, as a reviewer.');
		expect(mine[0].notice?.line).toBe('You now have access to Taskora.');
		expect(events.some((e) => e.id.startsWith('team:1:'))).toBe(false);
	});

	it('tells everyone else that a member joined, how many the team is then, the new one set apart', () => {
		const forCarmen = notificationsFor(events, 'carmen@x.io').filter((e) => e.notice?.title === 'A new member joined the project.');
		expect(forCarmen.map((e) => e.at)).toEqual(['2026-11-05T09:00:00.000Z', '2026-10-02T09:00:00.000Z']);
		expect(read(forCarmen[0].notice?.body)).toBe('The team now has **3 members**. **Léa Moreau** joined Taskora as a reviewer.');
		const visual = forCarmen[0].notice?.visual;
		expect(visual?.kind === 'members' && visual.people.map((p) => `${p.name}${p.isNew ? '*' : ''}`)).toEqual(['Carmen Martin', 'Hugo Bernard', 'Léa Moreau*']);
		expect(read(forCarmen[1].notice?.body)).toBe('The team now has **2 members**. **Hugo Bernard** joined Taskora as a contributor.');
	});
});
