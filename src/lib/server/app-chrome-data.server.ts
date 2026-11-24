import { timedPart } from './slow-requests.server';
import type { RequestEvent } from '@sveltejs/kit';
import { type AppServices } from '$composition/container.server';
import { notificationsFor, samePerson, type ActivityEvent } from '$domain/activity';
import { actorName, personLook } from '$domain/activity';
import { dismissalOf, resolvePeople, shortLine, standsOut, type NoticePerson } from '$domain/activity';
import { personColor } from '$domain/activity';
import { memberInitials } from '$domain/team';
import { AI_AUTHOR_PREFIX } from '$domain/discussions';
import { isUnread, type ActivityReads } from '$domain/activity';
import type { ActivityMember } from '$domain/activity';
import { mapLimit } from '$lib/shared/map-limit';
import { evolutionStanding, type EvolutionRequest } from '$domain/evolution';
import { requestPagePath } from '$domain/evolution';
import { sessionsInProgress } from '$domain/evolution';
import { EMPTY_APP_CHROME, type AppChrome, type BellKind, type BellNotification, type BellPerson } from '$lib/shared/app-chrome';
import { currentPersonId } from './evolution-actor.server';
import { loadReads, projectDiscussions, projectEvolution, projectRetrospecActivity, projectTeamActivity, visibleProjects, workspaceRoster, type ProjectEvolution, type VisibleProject } from './project-activity.server';
import { readRetrospecStatus } from './retrospec-status.server';
import { pickActiveWorkspace, pinnedWorkspace } from './caller-workspace.server';
import { aiLastSeenOf } from './retrospec-ai.server';
import { pausedRetrospecLabel } from '$domain/retrospec';
import { readProjectTabs } from './project-tabs.server';
import { readDriftPending } from './spec-code-drift.server';
import { readSpecValidationBoard } from './spec-validation.server';
import { readSpecStanding } from './spec-standing.server';
import { navChecks } from '$application/spec360/nav-checks';

/** How many notifications the bell keeps: the rest are older than anyone scrolls to. */
const BELL_SIZE = 20;

/** A bell entry is addressed by its project and its event, so a read mark lands in the right project. */
export const bellId = (projectId: string, eventId: string) => `${projectId}|${eventId}`;
export function parseBellId(id: string): { projectId: string; eventId: string } | null {
	const at = id.indexOf('|');
	return at > 0 ? { projectId: id.slice(0, at), eventId: id.slice(at + 1) } : null;
}

const HEAD: Readonly<Record<ActivityEvent['kind'], string>> = {
	mention: ' mentioned you',
	reply: ' replied to your comment',
	comment: ' opened a discussion',
	validated: ' validated',
	resolved: ' resolved a discussion',
	reopened: ' reopened a discussion',
	progressed: ' moved an evolution on',
	joined: ' joined the team',
	shared: ' shared an item with you',
	reminder: ' is waiting for your validation',
	created: ' created an evolution',
	ai_done: ' finished a task',
	info: ''
};

// What an AI did through Lyriks, and what Lyriks says itself, carry the Lyriks mark (criterion ccaa0784).
// A message an AI client wrote in a discussion is Lyriks's too, though its author is stored under an `ai:` address.
const kindOf = (e: ActivityEvent): BellKind =>
	e.actor.kind === 'ai' || e.actor.kind === 'lyriks' || e.actor.id.startsWith(AI_AUTHOR_PREFIX)
		? 'lyriks'
		: e.kind === 'mention' || e.kind === 'reply'
			? e.kind
			: e.kind === 'shared' || e.kind === 'reminder'
				? 'mention'
				: 'info';

export function toBell(
	e: ActivityEvent,
	project: VisibleProject,
	reads: ActivityReads,
	me: string,
	roster: readonly ActivityMember[],
	myName: string
): BellNotification {
	const look = personLook(e.actor.id, roster, e.actor.id === me ? myName : e.actorName);
	const notice = e.notice;
	// A notice says what happened, then who or what (criterion 65fdff0a); any other event reads its actor's line, then its text, at INFO.
	const title = notice?.title ?? `${actorName(e.actor, me, roster, myName, e.actorName)}${e.kind === 'ai_done' && e.line ? ` ${e.line}` : HEAD[e.kind]}`;
	const level = notice?.level ?? 'info';
	const person = (p: NoticePerson & { readonly isNew?: boolean }): BellPerson => {
		const you = !!p.id && samePerson(p.id, me);
		const seen = p.id ? personLook(p.id, roster, you ? myName || p.name : p.name) : { name: p.name, initials: memberInitials(p.name), color: personColor(p.name) };
		return { name: you ? 'You' : seen.name, initials: you ? 'YOU' : seen.initials, color: seen.color, you, ...(p.isNew ? { isNew: true } : {}) };
	};
	const visual = notice?.visual ? resolvePeople(notice.visual, person) : undefined;
	return {
		id: bellId(project.id, e.id),
		kind: standsOut(level) ? 'alert' : kindOf(e),
		where: `${project.name} · ${notice?.section ?? e.where}`,
		at: e.at,
		level,
		title,
		body: notice?.body ?? (e.text ? [{ text: e.text }] : []),
		line: notice?.line ?? shortLine(e.text || title),
		...(visual ? { visual } : {}),
		...(notice?.action ? { action: notice.action } : {}),
		...(notice?.progress === undefined ? {} : { progress: notice.progress }),
		dismiss: dismissalOf(level),
		unread: isUnread(e, reads),
		initials: look.initials,
		color: look.color,
		href: e.href
	};
}

export interface ReaderActivity {
	readonly me: string;
	readonly myName: string;
	readonly roster: readonly ActivityMember[];
	readonly projects: readonly ({
		readonly project: VisibleProject;
		readonly reads: ActivityReads;
		/** Threads of its Specification 360° still open. */
		readonly openDiscussions: number;
	} & ProjectEvolution)[];
}

/** Every visible project's activity and the reader's read marks on it. */
export async function readerActivity(services: AppServices, event: Pick<RequestEvent, 'locals' | 'cookies'>): Promise<ReaderActivity> {
	const me = currentPersonId(services);
	const [projects, workspaces] = await Promise.all([visibleProjects(services, event), services.workspaces.listForCaller().catch(() => [])]);
	// The workspace the switcher shows: on a browser that never pinned one, the reader's first, so their
	// name is the one their team knows them by and never one read off their email (criterion a975fd4c).
	const active = pickActiveWorkspace(workspaces, pinnedWorkspace(event))?.id ?? null;
	const [myName, roster] = await Promise.all([
		services.resolveActiveMemberName.execute(active).catch(() => ''),
		// The people of each visible project's own workspace, not of the one the switcher shows.
		workspaceRoster(services, projects, workspaces, active)
	]);
	const started = performance.now();
	const perProject = await mapLimit(projects, 6, async (project) => {
		// Each read timed apart: the bar reads them for every visible project on every page.
		const [evolution, discussions, retrospec, team, reads] = await Promise.all([
			timedPart('activity:evolution', projectEvolution(services, project.id, roster)),
			timedPart('activity:discussions', projectDiscussions(services, project.id)),
			timedPart('activity:retrospec', projectRetrospecActivity(services, project.id)),
			timedPart('activity:team', projectTeamActivity(services, project)),
			timedPart('activity:reads', loadReads(services, project.id, me))
		]);
		return {
			project,
			requests: evolution.requests,
			keys: evolution.keys,
			events: [...evolution.events, ...discussions.events, ...retrospec, ...team],
			reads,
			openDiscussions: discussions.openCount
		};
	});
	const ms = performance.now() - started;
	if (ms >= 500) console.warn(`[slow-part] activity:projects ${Math.round(ms)}ms (${projects.length} projects)`);
	return { me, myName, roster, projects: perProject };
}

/** The reader's notifications across their projects, newest first: the bell keeps BELL_SIZE, Home's feed more. */
export function bellOf(activity: ReaderActivity, size = BELL_SIZE): BellNotification[] {
	return activity.projects
		.flatMap(({ project, events, reads }) =>
			notificationsFor(events, activity.me).map((e) => toBell(e, project, reads, activity.me, activity.roster, activity.myName))
		)
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, size);
}

/** The app bar's notifications, first steps, retrospecification tick and running process for the reader. */
export async function loadAppChrome(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string | null
): Promise<AppChrome> {
	const signedIn = !event.locals.authRequired || !!event.locals.session?.isAuthenticated;
	if (!signedIn) return EMPTY_APP_CHROME;
	const services = event.locals.services;
	const [activity, retro, driftPending, validation] = await Promise.all([
		timedPart('chrome:activity', readerActivity(services, event)),
		projectId ? timedPart('chrome:retrospec', readRetrospecStatus(services, projectId).catch(() => null)) : Promise.resolve(null),
		// Cached by the revisions it was read at: a page load costs two revision reads when nothing moved.
		projectId ? timedPart('chrome:drift', readDriftPending(services, projectId).catch(() => null)) : Promise.resolve(null),
		// Read once for the tabs and the version line of Knowledge's band.
		projectId ? timedPart('chrome:validation', readSpecValidationBoard(services, projectId, null).catch(() => null)) : Promise.resolve(null)
	]);
	const current = activity.projects.find((p) => p.project.id === projectId);
	const requests = current?.requests ?? [];
	const keys = current?.keys ?? {};
	const [tabs, spec] = projectId
		? await Promise.all([
				readProjectTabs(services, projectId, retro, requests.length, validation?.board.summary ?? null).catch(() => null),
				validation ? readSpecStanding(services, projectId, validation).catch(() => null) : Promise.resolve(null)
			])
		: [null, null];
	return {
		notifications: bellOf(activity),
		progress: {
			retroDone: !!retro?.published,
			specVisited: false,
			evolutionStarted: requests.length > 0,
			evolutionVerified: requests.some((r) => r.stage === 'delivered' || r.status === 'closed')
		},
		retroDone: retro?.status === 'done',
		tabs,
		// The process running on the current project, at the right of the tabs; the reader's AI shows in Ask my AI (criterion 4cb97f74).
		// A run whose LLM went silent reads paused in the bar, which follows the LLM's calls from here on (criterion 7a4a99e4).
		live:
			projectId && retro?.status === 'running'
				? [{ label: retro.label, href: `/projects/${encodeURIComponent(projectId)}/retrospec`, llm: { seenAt: aiLastSeenOf(projectId), pausedLabel: pausedRetrospecLabel(retro.pct) } }]
				: [],
		evolutions: projectId
			? requests.map((r) => ({
					t: `${keys[r.id] ?? ''} · ${r.title.trim() || 'Untitled'}`,
					href: requestPagePath(projectId, r.id)
				}))
			: [],
		// The evolutions still open, counted beside Changes as its In progress filter counts them (criterion b2f17eef).
		openEvolutions: requests.filter((r) => evolutionStanding(r) === 'open').length,
		// The code changes made outside Lyriks still to review, once the spec is validated (criterion 4e7ec88c); only of a project the reader sees.
		drift: current && driftPending !== null ? { pending: driftPending } : null,
		spec,
		// What a draft validated so far, checked on the tabs of Knowledge (criterion 8e942b12).
		specChecks: validation?.board.summary.state === 'draft' ? navChecks(validation.elements, validation.board.standings) : null
	};
}
