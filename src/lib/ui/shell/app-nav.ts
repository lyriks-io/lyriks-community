import type { ProjectTab } from '$domain/portfolio/project-tabs';

/**
 * The app's navigation: Home (the cross-project dashboard) and the sections of
 * the current project (Reverse, Knowledge, Changes),
 * of which the navigation shows the ones the project has opened so far.
 */
export type AppTab = 'home' | ProjectTab | 'drift';

export interface AppNavTab {
	readonly id: ProjectTab;
	readonly label: string;
	readonly href: string;
}

const PROJECT_TABS: readonly { id: ProjectTab; label: string; path: string }[] = [
	{ id: 'retro', label: 'Reverse', path: 'retrospec' },
	{ id: 'spec', label: 'Knowledge', path: 'spec' },
	{ id: 'evolutions', label: 'Changes', path: 'evolution' }
];

const projectBase = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/** The tabs of a project, in the bar's order, keeping the opened ones (all of them when unknown). */
export function projectNavTabs(projectId: string | null, opened: readonly ProjectTab[] | null): AppNavTab[] {
	if (!projectId) return [];
	return PROJECT_TABS.filter((t) => !opened || opened.includes(t.id)).map((t) => ({
		id: t.id,
		label: t.label,
		href: `${projectBase(projectId)}/${t.path}`
	}));
}

/** The tab a path sits under; null for pages the bar has no tab for (settings, old capability pages). */
export function activeAppTab(pathname: string): AppTab | null {
	if (pathname === '/') return 'home';
	const [, root, , page] = pathname.split('/');
	if (root !== 'projects') return null;
	if (page === 'drift') return 'drift';
	return PROJECT_TABS.find((t) => t.path === page)?.id ?? null;
}

/** The project a path is inside, if any. */
export function projectIdOfPath(pathname: string): string | null {
	const [, root, id] = pathname.split('/');
	return root === 'projects' && id ? decodeURIComponent(id) : null;
}

/**
 * Where picking a project in the menu leads: Home, its feed limited to that
 * project (criterion 11c7c8c8 of feat-home), from Home as from any page;
 * nowhere when the reader is already inside it.
 */
export function projectEntryFrom(pathname: string, projectId: string): string | null {
	return projectIdOfPath(pathname) === projectId ? null : `/?project=${encodeURIComponent(projectId)}`;
}
