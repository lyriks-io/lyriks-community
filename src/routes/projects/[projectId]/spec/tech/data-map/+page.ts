import { DATA_MAP_PLACEMENTS_SECTION, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageLoad } from './$types';

/**
 * Where people put the tables, read on its own (criterion caec432a): a table
 * moved here or by someone else re-reads these few positions alone, never the
 * whole data map behind them, which the server load keeps until the
 * specification itself changes. A move marks nothing and moves no version.
 */
export const load: PageLoad = async ({ data, params, fetch, depends }) => {
	depends(sectionSyncKey(params.projectId, DATA_MAP_PLACEMENTS_SECTION) as `${string}:${string}`);
	const res = await fetch(`/api/projects/${encodeURIComponent(params.projectId)}/data-map-placements`).catch(() => null);
	const placements = res?.ok ? ((await res.json()) as { document?: typeof data.placements }).document ?? data.placements : data.placements;
	return { ...data, placements };
};
