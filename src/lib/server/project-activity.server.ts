import type { RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { scopeToWorkspace } from '$application/portfolio/scope-to-workspace';
import type { ActivityEvent } from '$domain/activity';
import type { EvolutionRequest } from '$domain/evolution';
import { requestKeyOf } from '$domain/evolution';
import { evolutionActivity, type ActivityMember } from '$domain/activity';
import { discussionActivity } from '$domain/activity';
import { retrospecActivity } from '$domain/activity';
import { teamActivity } from '$domain/activity';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { readRetrospecEvents, retrospecUnderWay } from './retrospec-status.server';
import { discussionEvents, openDiscussionCount } from '$domain/discussions';
import { parseReads, type ActivityReads } from '$domain/activity';
import { mapLimit } from '$lib/shared/map-limit';
import { callerWorkspaceScope } from './workspace-scope.server';
import { callerCanSeeProject } from './project-scope.server';

/**
 * The activity of the projects a reader can see, and what they have read of
 * it. A project's events are derived from its Evolution draft and kept per
 * revision, so a bar that reloads on every page reads each draft once per
 * change, not once per page.
 */

export interface VisibleProject {
	readonly id: string;
	readonly name: string;
}

/** The projects the caller may open: their workspaces, then their domain breadth and grants. */
export async function visibleProjects(
	services: AppServices,
	event: Pick<RequestEvent, 'locals' | 'cookies'>
): Promise<VisibleProject[]> {
	const listed = await services.listProjects.execute();
	const scoped = await scopeToWorkspace(listed, await callerWorkspaceScope(event), services.backLinks);
	const seen = await mapLimit(scoped, 8, (p) => callerCanSeeProject(event, p.id).catch(() => false));
	return scoped.filter((_, i) => seen[i]).map((p) => ({ id: p.id, name: p.name.trim() || 'Untitled project' }));
}

/** The people of the active workspace, by the id their acts carry (their email). */
export async function workspaceRoster(services: AppServices, activeWorkspaceId: string | undefined): Promise<ActivityMember[]> {
	try {
		const workspaces = await services.workspaces.listForCaller();
		const active = (activeWorkspaceId && workspaces.find((w) => w.id === activeWorkspaceId)) || workspaces[0];
		if (!active) return [];
		return (await services.workspaces.listMembers(active.id)).map((m) => ({ id: m.email, name: m.name?.trim() || m.email }));
	} catch {
		return [];
	}
}

export interface ProjectEvolution {
	/** Its requests, the deleted ones aside. */
	readonly requests: readonly EvolutionRequest[];
	/** Each request's key ("EVO-077"), counted over every request ever opened, deleted ones included. */
	readonly keys: Readonly<Record<string, string>>;
	readonly events: ActivityEvent[];
}

const cache = new Map<string, { revision: number; read: ProjectEvolution }>();

/** A project's Evolution requests and the activity they record, read once per revision of its draft. */
export async function projectEvolution(services: AppServices, projectId: string, roster: readonly ActivityMember[]): Promise<ProjectEvolution> {
	const revision = await services.sectionDocuments.currentRevision(projectId, 'evolution').catch(() => -1);
	const hit = cache.get(projectId);
	// The roster only finds mentions; a member joining changes no stored act, so the revision alone keys the cache.
	if (hit && hit.revision === revision && revision >= 0) return hit.read;
	const draft = await services.loadEvolutionDraft.execute(projectId).catch(() => null);
	const all = draft?.requests ?? [];
	const read: ProjectEvolution = {
		requests: all.filter((r) => r.status !== 'deleted'),
		keys: Object.fromEntries(all.map((r) => [r.id, requestKeyOf(all, r.id) ?? ''])),
		events: draft ? evolutionActivity(projectId, draft, roster) : []
	};
	cache.set(projectId, { revision, read });
	return read;
}

export interface ProjectDiscussions {
	readonly events: ActivityEvent[];
	/** Threads of its Specification 360° still open. */
	readonly openCount: number;
}

const discussionsCache = new Map<string, { revision: number; read: ProjectDiscussions }>();

/** A project's Specification 360° discussions as activity, read once per revision. */
export async function projectDiscussions(services: AppServices, projectId: string): Promise<ProjectDiscussions> {
	const loaded = await services.loadDiscussions.execute(projectId).catch(() => null);
	if (!loaded) return { events: [], openCount: 0 };
	const hit = discussionsCache.get(projectId);
	if (hit && hit.revision === loaded.revision) return hit.read;
	const read: ProjectDiscussions = {
		events: discussionActivity(projectId, discussionEvents(loaded.document, projectId)),
		openCount: openDiscussionCount(loaded.document)
	};
	discussionsCache.set(projectId, { revision: loaded.revision, read });
	return read;
}

const retrospecCache = new Map<string, { key: string; events: ActivityEvent[] }>();
/** How long a run under way keeps what its notifications say: its share and the silence of its LLM move without a revision. */
const UNDER_WAY_MS = 30_000;

/**
 * A project's retrospecification as activity, read once per revision of its
 * review document and of the scope (the audits that close an analysis), and
 * every half minute while a run is under way. A project that never started one
 * has nothing to say.
 */
export async function projectRetrospecActivity(services: AppServices, projectId: string): Promise<ActivityEvent[]> {
	const { doc, revision } = await loadRetrospecDocument(services.sectionDocuments, projectId).catch(() => ({ doc: null, revision: -1 }));
	if (!doc || doc.runs.length === 0) return [];
	const scopeRevision = await services.sectionDocuments.currentRevision(projectId, 'scope').catch(() => -1);
	const key = `${revision}:${scopeRevision}${retrospecUnderWay(doc) ? `:${Math.floor(Date.now() / UNDER_WAY_MS)}` : ''}`;
	const hit = retrospecCache.get(projectId);
	if (hit && hit.key === key) return hit.events;
	const events = retrospecActivity(projectId, await readRetrospecEvents(services, projectId).catch(() => []));
	retrospecCache.set(projectId, { key, events });
	return events;
}

const teamCache = new Map<string, { at: number; name: string; events: ActivityEvent[] }>();
/** How long a project's team is kept: it lives in another service, read without a revision. */
const TEAM_MS = 30_000;

/** Who joined a project's team, as activity (criterion 04fb1bbf of feat-feedback-docs), read at most every half minute. */
export async function projectTeamActivity(services: AppServices, project: VisibleProject, now = Date.now()): Promise<ActivityEvent[]> {
	const hit = teamCache.get(project.id);
	if (hit && hit.name === project.name && now - hit.at < TEAM_MS) return hit.events;
	const team = await services.loadTeam.execute(project.id).catch(() => null);
	const events = teamActivity(project.id, project.name, team?.collaborators ?? []);
	teamCache.set(project.id, { at: now, name: project.name, events });
	return events;
}

/** The residue document holding what one person has read of a project's activity. */
const readsSection = (personId: string) => `activity-reads:${personId}`;

export async function loadReads(services: AppServices, projectId: string, personId: string): Promise<ActivityReads> {
	return parseReads(await services.projectResidue.load(projectId, readsSection(personId)).catch(() => null));
}

export async function saveReads(services: AppServices, projectId: string, personId: string, reads: ActivityReads): Promise<void> {
	await services.projectResidue.save(projectId, readsSection(personId), reads);
}
