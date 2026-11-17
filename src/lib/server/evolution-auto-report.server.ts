import type { RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { resolveEvolutionActor } from './evolution-actor.server';
import { applyEvolutionOperations } from './evolution-operations.server';
import { loadEvolutionView } from './evolution-view.server';

/**
 * After an index sync, the report of every request standing at Build is built
 * again (ac-evo-impl-9): the sync is the only thing that changes what a report
 * reads, so nobody should have to click for it. One batch per request, so a
 * request whose report cannot be built never holds another back; a failure is
 * left for the page to show, never raised on the sync that caused it.
 */
export async function rebuildReportsAfterSync(
	services: AppServices,
	event: Pick<RequestEvent, 'request' | 'cookies'>,
	projectId: string
): Promise<void> {
	const view = await loadEvolutionView(services, projectId, { activeWorkspaceId: event.cookies.get('lyriks_active_ws') });
	const atBuild = view.draft.requests.filter((r) => r.status === 'open' && r.stage === 'implementation');
	if (atBuild.length === 0) return;
	const actor = await resolveEvolutionActor(services, event);
	for (const request of atBuild) {
		await applyEvolutionOperations(services, {
			projectId,
			operations: [{ op: 'build_implementation_report', requestId: request.id }],
			actor,
			origin: event.request.headers.get('x-lyriks-client'),
			activeWorkspaceId: event.cookies.get('lyriks_active_ws')
		}).catch(() => null);
	}
}
