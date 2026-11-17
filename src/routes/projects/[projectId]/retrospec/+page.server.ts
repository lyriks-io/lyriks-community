import { redirect } from '@sveltejs/kit';
import { isAnchor } from '$domain/discussions';
import { mcpEndpointFor } from '$domain/foundation';
import { RETROSPEC_SECTION, RETROSPEC_SECTIONS, specElementHref } from '$domain/retrospec';
import { IMPLEMENTATION_COVERAGE_SECTION, PROJECT_HEALTH_SECTION, RETROSPEC_DETECTED_SECTION, sectionSyncKey } from '$lib/shared/section-sync';
import { loadRetrospecPage } from '$lib/server/retrospec-page.server';
import { callerCanWrite } from '$lib/server/writer-gate.server';
import { retrospecLiveKey } from '$ui/retrospec/live-key';
import type { PageServerLoad } from './$types';

/**
 * The Retrospecification page: the specification an AI rebuilds from a
 * product's code (or its documentation), followed live while it writes, then
 * the summary of what it rebuilt. Live sync re-runs this load whenever the AI
 * writes one of the sections a retrospec fills, or a person acts on the run.
 *
 * The review moved to the Specification 360°: an older link to it (a
 * notification, a bookmark) lands there, on the element it named when the
 * Specification 360° shows it.
 */
export const load: PageServerLoad = async (event) => {
	const { params, depends, url, cookies } = event;
	if (url.searchParams.get('step') === 'validation') {
		const item = url.searchParams.get('item') ?? '';
		redirect(303, isAnchor(item) ? specElementHref(params.projectId, item) : `/projects/${encodeURIComponent(params.projectId)}/spec`);
	}
	for (const section of [...RETROSPEC_SECTIONS, RETROSPEC_SECTION, IMPLEMENTATION_COVERAGE_SECTION, RETROSPEC_DETECTED_SECTION]) depends(sectionSyncKey(params.projectId, section));
	// The summary reads Project health and the points still to review: a new reading, or a point sent to Evolutions, moves them.
	depends(sectionSyncKey(params.projectId, PROJECT_HEALTH_SECTION));
	depends(sectionSyncKey(params.projectId, 'evolution'));
	depends(retrospecLiveKey(params.projectId));
	const services = event.locals.services;
	const [page, canWrite] = await Promise.all([loadRetrospecPage(services, params.projectId, cookies), callerCanWrite(event, params.projectId)]);
	return { ...page, canWrite, mcpUrl: mcpEndpointFor(url.origin) };
};
