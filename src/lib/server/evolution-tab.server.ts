import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import {
	ALL_ROWS,
	boardCard,
	fieldsPart,
	historyPart,
	impactPart,
	loadBoardView,
	loadEvolutionView,
	proposalsPart,
	proposedKinds,
	reportPart,
	requestSummary,
	suggestionCards,
	type EvolutionView
} from './evolution-view.server';
import { resolveRole } from './evolution-actor.server';
import { callerNameForProject } from './caller-workspace.server';
import { closingReadingOf } from './evolution-closing.server';
import { concurrentImpactOf } from './evolution-cross.server';
import { STAGE_ORDER, decisionLog, findRequestByRef, proposalFates, withDraftNames, type Actor, type EvolutionRequest } from '$domain/evolution';

/**
 * Hydrate the Evolution page: the board, and one request's reading when the
 * URL names it.
 *
 * The board reads the requests alone (loadBoardView): it shows each one's key,
 * title and standing, so it never waits on the engine. A request named in the
 * URL (`?request=<id>`), or requests compared (`?concurrent=`), read the same
 * view the API serves to the MCP (see evolution-view.server.ts); a request comes
 * as its reading in three steps (the idea, the proposals to sign, the impact
 * report), with the parts the page shows folded (the full proposals, the
 * impacted nodes, the report lines once code exists, the timeline).
 */
export async function loadEvolutionTab(
	services: AppServices,
	projectId: string,
	url: URL,
	cookies: Cookies
) {
	const activeWorkspaceId = cookies.get('lyriks_active_ws');
	const session = services.currentSession();
	const readerId = session.email ?? 'local-operator';
	const requestId = url.searchParams.get('request');
	// The evolutions a reader picked on the list, read against each other (criterion f70b2e9f).
	const concurrentRefs = requestId ? [] : (url.searchParams.get('concurrent') ?? '').split(',').filter(Boolean);
	const onBoard = !requestId && concurrentRefs.length === 0;
	const [view, role, actorName] = await Promise.all([
		onBoard
			? loadBoardView(services, projectId, { readerId })
			: loadEvolutionView(services, projectId, {
					readerId,
					// A request's page reads its own readings, a comparison none (it reads the drafts).
					readingsOf: (requests) => {
						if (!requestId) return [];
						const named = findRequestByRef(requests.filter((r) => r.status !== 'deleted'), requestId);
						return named.kind === 'found' ? [named.request] : [];
					}
				}),
		// Who is acting, resolved once server-side in the workspace that owns the project, never
		// the switcher's: a viewer rules on nothing, only an admin lifts a waiver.
		resolveRole(services, projectId, activeWorkspaceId),
		// The name the whole app gives the person (member of the project's own workspace, operator profile,
		// then email), so a local operator reads by that name, never by a technical id (ac-evo-form-names).
		callerNameForProject(services, projectId, activeWorkspaceId).catch(() => '')
	]);
	// The same id the operations stamp (resolveEvolutionActor), or "mine" and
	// "awaits me" never match what this person did.
	const actor: Actor = { id: readerId, kind: 'person', role, channel: 'page' };
	const full = onBoard ? null : (view as EvolutionView);

	const live = view.draft.requests.filter((r) => r.status !== 'deleted');
	// Named in full, or by a unique prefix, the way the reports quote it.
	const found = requestId ? findRequestByRef(live, requestId) : null;
	const request = found?.kind === 'found' ? found.request : undefined;
	const now = Date.now();

	// Only what the page shows and acts on travels: the raw dossiers, the source
	// register and the readings of every request stay on the server (the board
	// sent 1.66 MB of them on a project with five requests, none of it read).
	return {
		cards: live.map((r) => boardCard(view, r, now)),
		suggestions: suggestionCards(view),
		reading: full && request ? await readingOf(services, full, request, actor, url) : null,
		concurrent: full && concurrentRefs.length > 0 ? concurrentImpactOf(full, concurrentRefs) : null,
		// The roster, with the person acting named the way the rest of the app names them.
		members: view.members.some((m) => m.id === actor.id) || !actorName.trim()
			? view.members
			: [...view.members, { id: actor.id, name: actorName.trim(), role }],
		leaves: view.leaves,
		actor
	};
}

/** One request as its page reads it. */
async function readingOf(services: AppServices, view: EvolutionView, request: EvolutionRequest, actor: Actor, url: URL) {
	const codeExists = STAGE_ORDER.indexOf(request.stage) >= STAGE_ORDER.indexOf('implementation');
	return {
		dossier: {
			...requestSummary(view, request, actor),
			// The summary counts the fields so a tool answer stays one size
			// whatever the request touches; the page shows them all, per leaf.
			// The page, not a tool answer: the value comes whole (9c15b7d2).
			fields: fieldsPart(view, request, { limit: ALL_ROWS, excerpt: false }).fields.entries
		},
		proposals: proposalsPart(view, request, actor, { limit: ALL_ROWS }).proposals.entries,
		// What became of every suggestion that no longer waits, so a link handed out to one opens on what took its place (ac-evo-link-arrival-only).
		proposalFates: proposalFates(request),
		// The three walks are still computed, because adding, changing and
		// removing reach different things; the page reads ONE of them per row,
		// the one the request actually proposes (d17092da).
		// In the language the spec is written in, like every text the dossier generates.
		impacts: {
			add: impactPart(request, { hypothesis: 'add' }, view.language).impact,
			change: impactPart(request, { hypothesis: 'change' }, view.language).impact,
			remove: impactPart(request, { hypothesis: 'remove' }, view.language).impact
		},
		// What the request PROPOSES, so every row can carry the verb of the
		// draft that stands for it instead of three columns among which none
		// describes a request that both adds and amends.
		proposes: proposedKinds(request),
		report: codeExists ? reportPart(view.projectId, request, { limit: ALL_ROWS }).report : null,
		history: historyPart(request).history,
		// Every field's versions, so each card opens its own history (ac-evo-hist-field-versions).
		fieldVersions: historyPart(request, { excerpt: false }).fieldVersions,
		// Every decision taken on it, who took it and why, newest first (the design's decision log).
		decisionLog: decisionLog(request, { say: withDraftNames(request, { nameOf: (id) => view.leaves.find((l) => l.id === id)?.name ?? id }).say }),
		// What the closing block reads once the request is closed: the ticket message and the new version of the spec.
		closing: await closingReadingOf(services, view, request, url.origin)
	};
}

export type EvolutionTabData = Awaited<ReturnType<typeof loadEvolutionTab>>;
