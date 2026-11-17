import { emptyDiscussions, type DiscussionsDocument } from '$domain/discussions';
import { SPEC_DISCUSSIONS_SECTION, sectionSyncKey } from '$lib/shared/section-sync';
import type { LayoutLoad } from './$types';

/**
 * The project's discussions, read from their own endpoint and keyed on their
 * own section: a post in another tab re-runs this load alone, never the spec
 * reads of the page under it.
 */
export const load: LayoutLoad = async ({ data, fetch, params, depends }) => {
	// The live-sync client invalidates this exact key when another tab posts.
	depends(sectionSyncKey(params.projectId, SPEC_DISCUSSIONS_SECTION) as `${string}:${string}`);
	const res = await fetch(`/projects/${encodeURIComponent(params.projectId)}/spec/discussions`).catch(() => null);
	const discussions: { document: DiscussionsDocument; revision: number } = res?.ok
		? await res.json()
		: { document: emptyDiscussions(), revision: 0 };
	return { ...data, discussions };
};
