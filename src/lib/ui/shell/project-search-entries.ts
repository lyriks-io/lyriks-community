import type { RecentChange } from '$domain/features/recent-changes';
import type { SearchEntry } from './app-search';

/** What the search reads of a project once: the entries it filters, and what it lists while nothing is typed. */
export interface ProjectSearch {
	readonly entries: SearchEntry[];
	readonly recent: RecentChange[];
}

const NOTHING: ProjectSearch = { entries: [], recent: [] };

/** What the search box finds in a project, each entry opening its page of the Specification 360°. */
export async function projectSearchEntries(projectId: string): Promise<ProjectSearch> {
	const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/spec-search`);
	if (!res.ok) return NOTHING;
	const body = (await res.json()) as Partial<ProjectSearch>;
	return { entries: body.entries ?? [], recent: body.recent ?? [] };
}
