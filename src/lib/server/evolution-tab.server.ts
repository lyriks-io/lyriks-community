import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import {
	ALL_ROWS,
	fieldsPart,
	historyPart,
	impactPart,
	loadEvolutionView,
	proposalsPart,
	reportPart,
	requestCard,
	requestSummary
} from './evolution-view.server';
import { resolveRole } from './evolution-actor.server';
import { STAGE_ORDER, type Actor } from '$domain/evolution';

/**
 * Hydrate the Evolution tab of the Features capability: the board, and one
 * request's reading when the URL names it.
 *
 * Evolution is a TAB of Features, not a capability of its own, so this load
 * hangs off the Features page. It is deliberately a separate function called
 * only when `?tab=evolution` is on the URL: the Features load is the heaviest
 * in the product, and a reader on the tree must not pay for the evolution view
 * they are not looking at.
 *
 * The tab reads the same view the API serves to the MCP (see
 * evolution-view.server.ts). The board is one card per live request; a request
 * named in the URL (`?request=<id>`) comes as its reading in three steps (the
 * idea, the proposals to sign, the impact report), with the parts the page
 * shows folded (the full proposals, the impacted nodes, the report lines once
 * code exists, the timeline). `view=full` keeps the complete dossier, which
 * reads the raw draft through its own store.
 */
export async function loadEvolutionTab(
	services: AppServices,
	projectId: string,
	url: URL,
	cookies: Cookies
) {
	const activeWorkspaceId = cookies.get('lyriks_active_ws');
	const [view, role] = await Promise.all([
		loadEvolutionView(services, projectId, { activeWorkspaceId }),
		// Who is acting, resolved once server-side: a viewer rules on nothing,
		// only an admin lifts a waiver, so the role comes from the roster.
		resolveRole(services, activeWorkspaceId)
	]);
	const session = services.currentSession();
	const actor: Actor = { id: session.email ?? 'unknown', kind: 'person', role, channel: 'page' };

	const live = view.draft.requests.filter((r) => r.status !== 'deleted');
	const requestId = url.searchParams.get('request');
	const request = requestId ? live.find((r) => r.id === requestId) : undefined;
	const codeExists = request
		? STAGE_ORDER.indexOf(request.stage) >= STAGE_ORDER.indexOf('implementation')
		: false;
	const reading = request
		? {
				dossier: {
					...requestSummary(view, request, actor),
					// The summary counts the fields so a tool answer stays one size
					// whatever the request touches; the page shows them all, per leaf.
					fields: fieldsPart(view, request, { limit: ALL_ROWS }).fields.entries
				},
				proposals: proposalsPart(view, request, actor, { limit: ALL_ROWS }).proposals.entries,
				// The three readings at once (ac-evo-imp-11); the page shows them as panels.
				impacts: {
					add: impactPart(request, { hypothesis: 'add' }).impact,
					change: impactPart(request, { hypothesis: 'change' }).impact,
					remove: impactPart(request, { hypothesis: 'remove' }).impact
				},
				report: codeExists ? reportPart(request).report : null,
				history: historyPart(request).history
			}
		: null;

	return {
		draft: view.draft,
		cards: live.map((r) => requestCard(view, r)),
		reading,
		members: view.members,
		fullView: url.searchParams.get('view') === 'full',
		leaves: view.leaves,
		sources: view.sources,
		session,
		actor,
		revision: view.revision,
		held: view.held,
		coverage: view.coverage,
		filled: view.filled,
		trlByLeaf: view.trlByLeaf,
		readings: view.readings
	};
}

export type EvolutionTabData = Awaited<ReturnType<typeof loadEvolutionTab>>;
