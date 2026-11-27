/**
 * The project's part of the app's left navigation (criteria b2f17eef,
 * 8e942b12): which entry the page on screen lights, and which tab of
 * Knowledge it underlines. Pure, so the lighting is tested without a browser.
 */
export type SideEntry = 'retro' | 'knowledge' | 'evolutions' | 'drift' | 'noticed' | 'settings';

/** The chapters of Knowledge, each a tab across the top of its pages; the keys navChecks gives them. */
export type KnowledgeTab = 'overview' | 'features' | 'users' | 'experience' | 'tech' | 'glossary';

/** The entry a page sits under, the tab of Knowledge it shows, and the item it shows under it (a core feature, a feature, a profile, a view). */
export interface SidePlace {
	readonly entry: SideEntry | null;
	readonly tab: KnowledgeTab | null;
	readonly item: string | null;
}

const KNOWLEDGE_TABS: Readonly<Record<string, KnowledgeTab>> = {
	'': 'overview',
	features: 'features',
	users: 'users',
	experience: 'experience',
	tech: 'tech',
	glossary: 'glossary'
};

const PROJECT_PAGES: Readonly<Record<string, SideEntry>> = { retrospec: 'retro', evolution: 'evolutions', drift: 'drift', settings: 'settings' };

const NOWHERE: SidePlace = { entry: null, tab: null, item: null };

const decoded = (segment: string | undefined) => (segment ? decodeURIComponent(segment) : null);

/**
 * Where a path sits in the project's navigation; nowhere outside a project or
 * on a page it has no entry for. Every page of the specification but Notices
 * sits under Knowledge, a chapter's page and every page under it on its tab.
 */
export function sidePlace(pathname: string): SidePlace {
	const [, root, id, page, chapter = '', item] = pathname.replace(/\/+$/, '').split('/');
	if (root !== 'projects' || !id || !page) return NOWHERE;
	if (page !== 'spec') return { ...NOWHERE, entry: PROJECT_PAGES[page] ?? null };
	if (chapter === 'noticed') return { ...NOWHERE, entry: 'noticed' };
	const tab = KNOWLEDGE_TABS[chapter] ?? null;
	// A feature's action page shows its feature; Who can do what shows Users itself; a view of Technology & data shows itself.
	const own = tab === 'features' || tab === 'tech' || (tab === 'users' && item !== 'matrix') ? decoded(item) : null;
	return { entry: 'knowledge', tab, item: own };
}
