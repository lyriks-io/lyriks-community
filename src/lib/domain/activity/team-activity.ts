import { ROLE_LABEL, type Collaborator } from '$domain/team';
import type { ActivityEvent } from './activity';
import { counted, plain, shortLine, strong, type ActivityNotice, type NoticePerson } from './notice';

/**
 * A project's team as activity (criterion 04fb1bbf of feat-feedback-docs): a
 * person added to it hears that they were invited, the members already on the
 * team hear that a member joined, both dated by the day they joined. The first
 * member founded the team, so nobody invited them.
 */

const personOf = (c: Collaborator): NoticePerson & { readonly email: string } => ({ id: c.email, email: c.email, name: c.name.trim() || c.email });
const roleOf = (c: Collaborator) => ROLE_LABEL[c.role]?.toLowerCase() ?? c.role;
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function invitedNotice(project: string, c: Collaborator, team: readonly Collaborator[]): ActivityNotice {
	const role = roleOf(c);
	return {
		section: 'Team',
		level: 'info',
		title: "You've been invited to a project.",
		body: [plain('You now have access to '), strong(project), plain(` and its specification, as ${article(role)} ${role}.`)],
		line: shortLine(`You now have access to ${project}.`),
		action: { label: 'Open the project', icon: 'go' },
		visual: { kind: 'members', people: team.map((m) => ({ ...personOf(m), ...(m.id === c.id ? { isNew: true } : {}) })), label: `${counted(team.length, 'member')} · ${role}` }
	};
}

function joinedNotice(project: string, c: Collaborator, team: readonly Collaborator[]): ActivityNotice {
	const who = personOf(c);
	const role = roleOf(c);
	return {
		section: 'Team',
		level: 'info',
		title: 'A new member joined the project.',
		body: [plain('The team now has '), strong(counted(team.length, 'member')), plain('. '), strong(who.name), plain(` joined ${project} as ${article(role)} ${role}.`)],
		line: shortLine(`${who.name} joined ${project}.`),
		action: { label: 'See the team', icon: 'go' },
		visual: { kind: 'members', people: team.map((m) => ({ ...personOf(m), ...(m.id === c.id ? { isNew: true } : {}) })), label: `${counted(team.length, 'member')} · 1 new` }
	};
}

export function teamActivity(projectId: string, projectName: string, collaborators: readonly Collaborator[]): ActivityEvent[] {
	const dated = collaborators.filter((c) => c.email.trim() && !Number.isNaN(Date.parse(c.joinedAt))).slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
	const project = projectName.trim() || 'the project';
	const href = `/projects/${encodeURIComponent(projectId)}`;
	return dated.slice(1).flatMap((c) => {
		const team = dated.filter((m) => m.joinedAt <= c.joinedAt);
		const who = personOf(c);
		const base = { projectId, at: c.joinedAt, where: 'Team', text: '' };
		return [
			// The person invited hears it from Lyriks: who added them is not recorded.
			{ ...base, id: `team:${c.id}:invited`, actor: { id: 'lyriks', kind: 'lyriks' as const }, kind: 'joined' as const, line: `added ${who.name} to the team`, href, to: [c.email], notice: invitedNotice(project, c, team) },
			{ ...base, id: `team:${c.id}:joined`, actor: { id: c.email, kind: 'person' as const }, kind: 'joined' as const, line: `joined the team as ${roleOf(c)}`, href: '/settings#members', to: team.filter((m) => m.id !== c.id).map((m) => m.email), actorName: who.name, notice: joinedNotice(project, c, team) }
		];
	});
}
