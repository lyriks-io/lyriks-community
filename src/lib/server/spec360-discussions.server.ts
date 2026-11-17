import { shortMemo } from './short-memo.server';
import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { disciplineLabel, shortName } from '$domain/team';
import type { DiscussionAuthor, DiscussionsDocument } from '$domain/discussions';
import type { PersonJobs } from '$application/ports/team-jobs';
import { currentPersonId } from './evolution-actor.server';

/**
 * The server side of the Specification 360° discussions: the reader the Home
 * and the notifications use, who is writing, and the colleagues a thread can
 * notify. The discussions themselves are the `$domain/discussions` context;
 * this module only resolves the people around them.
 */

/** A project's discussions and the revision a write must name. */
export async function loadDiscussions(
	services: AppServices, projectId: string
): Promise<{ document: DiscussionsDocument; revision: number }> {
	return services.loadDiscussions.execute(projectId);
}

/**
 * Who is posting: the session's identity (the one operator's id with auth
 * off) under the name the whole app gives them, so a thread reads by name
 * the way the Evolution comments do.
 */
export async function discussionAuthor(services: AppServices, cookies: Cookies): Promise<DiscussionAuthor> {
	const email = currentPersonId(services);
	const name = await services.resolveActiveMemberName
		.execute(cookies.get('lyriks_active_ws') ?? null)
		.catch(() => '');
	return { email, name: name.trim() || (email === 'local-operator' ? 'Local operator' : email) };
}

/** A colleague a thread can notify, named the way the page shows them. */
export interface DiscussionPerson {
	readonly email: string;
	/** "Carmen R." */
	readonly name: string;
	/** What they do on the project ("Tech Lead"), '' when nobody said. */
	readonly job: string;
}

const lower = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();

/**
 * Everyone a thread can notify: the project's team and the members of the
 * caller's workspace, each once by email. Either source may be missing (the
 * open-source build has no workspace roster, a project may have no team yet);
 * the picker then simply offers fewer people, never fails the page.
 */
const rosters = shortMemo<DiscussionPerson[]>();

export function discussionRoster(services: AppServices, projectId: string, cookies: Cookies): Promise<DiscussionPerson[]> {
	// One read per project, workspace and reader for a few seconds (short-memo): every page of Knowledge asks.
	const key = `${projectId}|${cookies.get('lyriks_active_ws') ?? ''}|${currentPersonId(services)}`;
	return rosters(key, () => readDiscussionRoster(services, projectId, cookies));
}

async function readDiscussionRoster(services: AppServices, projectId: string, cookies: Cookies): Promise<DiscussionPerson[]> {
	const people = new Map<string, DiscussionPerson>();
	const add = (email: string, person: Omit<DiscussionPerson, 'email'>) => {
		const key = lower(email);
		if (!key || !key.includes('@')) return;
		const known = people.get(key);
		people.set(key, {
			email: key,
			name: known?.name || person.name,
			job: known?.job || person.job
		});
	};

	const team = await services.loadTeam.execute(projectId).catch(() => ({ collaborators: [] }));
	for (const c of team.collaborators) {
		const discipline = disciplineLabel(c);
		add(c.email, { name: shortName(c), job: discipline === 'Member' ? '' : discipline });
	}

	try {
		const activeId = cookies.get('lyriks_active_ws');
		const workspaces = await services.workspaces.listForCaller();
		const active = (activeId && workspaces.find((w) => w.id === activeId)) || workspaces[0];
		if (active) {
			const [members, jobs] = await Promise.all([
				services.workspaces.listMembers(active.id),
				services.teamJobs.forProject(active.id, projectId).catch(() => new Map<string, PersonJobs>())
			]);
			for (const m of members) {
				add(m.email, {
					name: shortName({ name: m.name ?? '', email: m.email }),
					job: jobs.get(lower(m.email))?.names.join(', ') ?? ''
				});
			}
		}
	} catch (err) {
		console.warn('[spec360] workspace roster unavailable:', err);
	}
	return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}
