import type { AppServices } from '$composition/container.server';
import type { RequestEvent } from '@sveltejs/kit';
import { driftNotices, type DriftNotice } from '$domain/activity';
import { feedProjects } from '$domain/activity';
import { FIRST_FEED_QUERY, feedPage, type FeedPage, type FeedQuery } from '$domain/activity';
import { homeRuns, runMark, type HomeRunCard } from '$domain/activity';
import type { HomeCodeChange, HomeRun, HomeSource } from '$domain/activity';
import { dismissalOf, resolvePeople } from '$domain/activity';
import { personColor } from '$domain/activity';
import { memberInitials } from '$domain/team';
import { isEmptyProject } from '$domain/portfolio/project-folders';
import { currentRun, everRebuilt, rebuiltFromSourceMode, reviewCounts, runPaused, type RetrospecDocument, type RetrospecMode, type RetrospecStatus } from '$domain/retrospec';
import { lastRunOf, type LastRunState } from '$domain/retrospec/last-run';
import { sortByName } from '$domain/shared';
import type { BellNotification } from '$lib/shared/app-chrome';
import type { FeedCard, HomeFeedData } from '$lib/shared/home-feed';
import { timeAgo } from '$lib/shared/time-ago';
import { mapLimit } from '$lib/shared/map-limit';
import { bellId, bellOf, parseBellId, readerActivity, type ReaderActivity } from './app-chrome-data.server';
import { callerAllowedDomains } from './domain-scope.server';
import { aiLastSeenOf } from './retrospec-ai.server';
import { readRetrospecStanding } from './retrospec-status.server';
import { readDriftChanges } from './spec-code-drift.server';
import { readSpecValidation } from './spec-validation.server';
import { callerWorkspaceScope } from './workspace-scope.server';
import { callerCanWrite } from './writer-gate.server';

/**
 * Home (feat-home): the feed of the reader's notifications across every
 * project they can open, with one card per feature whose code changed outside
 * Lyriks (criterion d18e3e74), and Running now, what Lyriks is doing for them
 * (criterion ee8adfec). Each project is read once: its last
 * Reverse-Specification, its evolutions, the code changed once its
 * specification is validated and the reader's read marks. Scoped to the
 * caller's workspaces and domains when auth is on.
 */

export interface HomeData extends HomeFeedData {
	readonly hasWorkspace: boolean;
	readonly myName: string;
	readonly hasProjects: boolean;
	readonly runs: readonly HomeRunCard[];
	/** The name of each project the reader can open, for the feed's filter. */
	readonly projectNames: Readonly<Record<string, string>>;
	/** A project with nothing written yet asks, on Home, how to start it. */
	readonly emptyProjects: readonly string[];
	readonly projectIds: readonly string[];
}

/** The moment a Reverse-Specification is dated at: its start, else the AI's final check, else the AI's last call. */
function runStartedAt(projectId: string, status: RetrospecStatus, doc: RetrospecDocument): string | null {
	const run = currentRun(doc);
	if (run) return run.startedAt;
	const checked = status.ending && 'checkedAt' in status.ending ? status.ending.checkedAt : null;
	return checked ?? aiLastSeenOf(projectId);
}

/** How far a run went: its share read while it reads, where it was closed, the share validated in review. */
function runShare(state: LastRunState, status: RetrospecStatus, doc: RetrospecDocument): number {
	switch (state) {
		case 'running':
		case 'paused':
			return status.pct;
		case 'partial':
			return status.ending && 'closedAtPct' in status.ending ? status.ending.closedAtPct : status.pct;
		case 'review': {
			const counts = reviewCounts(currentRun(doc));
			return counts.total > 0 ? Math.round((100 * counts.validated) / counts.total) : 0;
		}
		case 'not_launched':
			return 0;
		case 'complete':
		case 'validated':
			return 100;
	}
}

type Standing = Awaited<ReturnType<typeof readRetrospecStanding>>;

function runOf(projectId: string, name: string, rebuiltFrom: RetrospecMode | null, standing: Standing | null): HomeRun | null {
	if (!standing || !everRebuilt(standing.doc, rebuiltFrom)) return null;
	const { status, doc } = standing;
	// A run whose LLM went silent reads paused, never running (criterion 7a4a99e4).
	const paused = runPaused(aiLastSeenOf(projectId), Date.now());
	const last = lastRunOf({ status, doc, rebuiltFrom, productName: name, paused, when: (iso) => timeAgo(iso) });
	const at = runStartedAt(projectId, status, doc);
	if (!last || !at) return null;
	const base = `/projects/${encodeURIComponent(projectId)}`;
	// A card opens the run's page, the Reverse page (criteria ee8adfec, 2dbed801).
	return { ...last, at, pct: runShare(last.state, status, doc), href: `${base}/retrospec` };
}

async function readDrift(services: AppServices, projectId: string): Promise<HomeCodeChange[] | null> {
	const changes = await readDriftChanges(services, projectId).catch(() => null);
	return (
		changes?.map((c) => ({
			key: c.key,
			featureId: c.featureId,
			featureName: c.featureName,
			shift: c.shift,
			elementLabel: c.elementLabel,
			specText: c.specText,
			snippet: c.snippet,
			where: c.where,
			code: c.code,
			readAt: c.readAt,
			decided: !!c.decision
		})) ?? null
	);
}

/** The code is followed against the specification once it is validated, and its changes are decided by who may edit. */
async function readDecidableDrift(services: AppServices, projectId: string, mayEdit: boolean): Promise<HomeCodeChange[] | null> {
	if (!mayEdit) return null;
	const summary = await readSpecValidation(services, projectId, null).catch(() => null);
	return summary?.state === 'validated' ? readDrift(services, projectId) : null;
}

async function readProject(
	services: AppServices, base: Pick<HomeSource, 'id' | 'name' | 'requests' | 'keys' | 'reads'>,
	rebuiltFrom: RetrospecMode | null,
	mayEdit: boolean
): Promise<HomeSource> {
	const [standing, drift] = await Promise.all([readRetrospecStanding(services, base.id).catch(() => null), readDecidableDrift(services, base.id, mayEdit)]);
	return { ...base, run: runOf(base.id, base.name, rebuiltFrom, standing), drift, mayEdit };
}

/** A code change waiting for a decision, as a card of the feed, read with the bell's read marks. */
function driftCard(project: Pick<HomeSource, 'id' | 'name'>, d: DriftNotice): BellNotification {
	const n = d.notice;
	return {
		id: bellId(project.id, d.id),
		kind: 'alert',
		where: `${project.name} · ${n.section}`,
		at: d.at,
		level: n.level,
		title: n.title,
		body: n.body,
		line: n.line,
		// A code change's picture names nobody; a person it would name reads by their own name.
		...(n.visual ? { visual: resolvePeople(n.visual, (p) => ({ name: p.name, initials: memberInitials(p.name), color: personColor(p.name), you: false })) } : {}),
		...(n.action ? { action: n.action } : {}),
		dismiss: dismissalOf(n.level),
		unread: d.unread,
		initials: '',
		color: '',
		href: d.href
	};
}

/** Every card of the reader's feed: their notifications, and one card per feature whose code changed outside Lyriks. */
function feedCards(activity: ReaderActivity, sources: readonly HomeSource[]): FeedCard[] {
	const now = new Date().toISOString();
	return [...bellOf(activity, Infinity), ...sources.flatMap((p) => driftNotices(p, now).map((d) => driftCard(p, d)))].map((card) => ({
		...card,
		projectId: parseBellId(card.id)?.projectId ?? ''
	}));
}

/**
 * The next cards of the feed (action c7f50ac5), for the reader Home is read
 * for. Lyriks keeps no list of notifications: the feed is worked out from what
 * each project records, so a page costs one reading of the projects, without
 * the runs Home alone shows.
 */
export async function readHomeFeedPage(event: Pick<RequestEvent, 'locals' | 'cookies'>, query: FeedQuery): Promise<FeedPage<FeedCard>> {
	const [activity, mayEdit] = await Promise.all([readerActivity(event.locals.services, event), callerCanWrite(event)]);
	const sources = await mapLimit(activity.projects, 6, async ({ project, requests, keys, reads }) => ({
		id: project.id,
		name: project.name,
		requests,
		keys,
		reads,
		run: null,
		drift: await readDecidableDrift(event.locals.services, project.id, mayEdit),
		mayEdit
	}));
	return feedPage(feedCards(activity, sources), query);
}

export async function readHome(event: Pick<RequestEvent, 'locals' | 'cookies'>): Promise<HomeData> {
	const services = event.locals.services;
	const scope = await callerWorkspaceScope(event);
	const allowedDomains = await callerAllowedDomains(event);
	const [portfolio, activity, mayEdit] = await Promise.all([
		services.buildPortfolio.execute(scope, allowedDomains, event.locals.session?.email ?? null),
		readerActivity(services, event),
		callerCanWrite(event)
	]);
	const cards = [...portfolio.domains.flatMap((d) => d.projects), ...portfolio.unassigned];
	const sources = await mapLimit(activity.projects, 6, ({ project, requests, keys, reads }) =>
		readProject(services, { id: project.id, name: project.name, requests, keys, reads }, rebuiltFromSourceMode(cards.find((c) => c.id === project.id)?.sourceMode), mayEdit)
	);
	const allCards = feedCards(activity, sources);
	const first = feedPage(allCards, FIRST_FEED_QUERY);
	const empty = new Set(cards.filter((c) => isEmptyProject(c)).map((c) => c.id));
	return {
		hasWorkspace: scope === null || scope.size > 0,
		myName: activity.myName,
		hasProjects: sources.length > 0,
		feed: first.cards,
		feedNext: first.next,
		feedUnread: allCards.filter((c) => c.unread).map(({ id, level, at, projectId }) => ({ id, level, at, projectId })),
		feedProjects: feedProjects(allCards),
		// Each card carries the mark that hides it, and one put aside stays out while its state stands (action a6a79b22).
		runs: homeRuns(sources, { me: activity.me, roster: activity.roster, now: Date.now() })
			.filter((r) => !sources.find((p) => p.id === r.projectId)?.reads.readIds.includes(runMark(r)))
			.map((r) => ({ ...r, hideId: bellId(r.projectId, runMark(r)) })),
		projectNames: Object.fromEntries(sources.map((p) => [p.id, p.name])),
		emptyProjects: sortByName(sources.filter((p) => empty.has(p.id) && !p.run)).map((p) => p.id),
		projectIds: sources.map((p) => p.id)
	};
}
