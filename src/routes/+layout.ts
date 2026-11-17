import { NOTIFICATIONS_DEPENDENCY } from '$ui/shell/notifications-client';
import { EMPTY_APP_CHROME, type AppChrome } from '$lib/shared/app-chrome';
import {
	projectSyncKey,
	RETROSPEC_REVIEW_SECTION,
	sectionSyncKey,
	SPEC_DISCUSSIONS_SECTION
} from '$lib/shared/section-sync';
import type { LayoutLoad } from './$types';

/**
 * What the app bar shows beyond the session: the reader's notifications, how
 * far they got in the first steps, the tick of a published retrospecification
 * and a process running now. Read from its own endpoint so a read mark
 * refreshes it alone (`NOTIFICATIONS_DEPENDENCY`), without reloading the page;
 * inside a project it also follows the live changes of that project (an
 * analysis advancing, a review act, a thread), which the server reads from
 * its per-revision caches.
 */
export const load: LayoutLoad = async ({ data, fetch, depends }) => {
	depends(NOTIFICATIONS_DEPENDENCY);
	const signedIn = !data.authRequired || !!data.session?.isAuthenticated;
	if (!signedIn || data.currentProjectUnavailable) return { ...data, chrome: EMPTY_APP_CHROME };
	const project = data.currentProject?.id;
	if (project) {
		const keys = [projectSyncKey(project), ...[RETROSPEC_REVIEW_SECTION, SPEC_DISCUSSIONS_SECTION, 'evolution'].map((s) => sectionSyncKey(project, s))];
		depends(...(keys as `${string}:${string}`[]));
	}
	const res = await fetch(project ? `/api/chrome?project=${encodeURIComponent(project)}` : '/api/chrome').catch(() => null);
	const chrome: AppChrome = res?.ok ? await res.json() : EMPTY_APP_CHROME;
	return { ...data, chrome };
};
