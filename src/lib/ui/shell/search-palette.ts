import { searchResults, type SearchEntry } from './app-search';

/**
 * What the search palette lists (criterion e11bf80b): empty, Recent (the last
 * entries opened from it on this browser) and Actions; typed, what matches In
 * this project, among the Actions and among the Other projects. Each row reads
 * as the design draws it: its kind on the left, its name, where it sits on the
 * right. Pure, so the lists are tested without a browser.
 */
export interface PaletteRow {
	/** The kind of thing it is: Page, Area, Feature, Rule, User, Term, Evolution, Action, Project. */
	readonly g: string;
	readonly t: string;
	/** Where it sits: the section or the core feature; '' when it is a page of its own. */
	readonly p: string;
	/** Under a rule's name, the words of its reason around what was typed, when only the reason holds them (criterion e11bf80b). */
	readonly sub?: string;
	/** Where it leads; absent on an action the page runs (New project). */
	readonly href?: string;
	readonly act?: 'new-project';
}

export interface PaletteGroup {
	readonly title: string;
	readonly rows: readonly PaletteRow[];
}

/** How many entries Recent keeps, and how many other projects a query lists. */
export const RECENT_MAX = 5;
const OTHER_PROJECTS_MAX = 6;

/** A search entry as a row: its kind told from the section the index files it under. */
export function rowOf(e: SearchEntry): PaletteRow {
	const row = (g: string, p: string): PaletteRow => ({ g, t: e.t, p, href: e.href });
	switch (e.k) {
		case 'Page':
			return row('Page', '');
		case 'Knowledge':
			return row('Page', e.k);
		case 'Evolution':
			return row('Evolution', 'Changes');
		case 'Glossary':
			return row('Term', 'Glossary');
		case 'Users and permissions':
			return row('User', 'Users');
		case 'Feature':
			return row('Area', 'Features');
		case 'Experience':
		case 'Technology & data':
			return row('Element', e.k);
		case 'Rule':
			return row('Rule', e.at ?? '');
		default:
			// A feature is filed under its core feature's name.
			return row('Feature', e.k);
	}
}

const has = (text: string, q: string) => text.toLowerCase().includes(q);

/** How many characters a rule's row keeps of its reason around the words typed, on each side. */
const SNIPPET_RADIUS = 36;

/**
 * The words of a long text around the first place the query matches, cut at
 * word boundaries with an ellipsis where it was cut, so a rule found by its
 * reason shows why; the text whole when it is short or holds no match.
 */
export function snippet(text: string, query: string, radius = SNIPPET_RADIUS): string {
	const q = query.trim().toLowerCase();
	const at = q ? text.toLowerCase().indexOf(q) : -1;
	if (at < 0 || text.length <= radius * 2 + q.length) return text;
	let from = Math.max(0, at - radius);
	let to = Math.min(text.length, at + q.length + radius);
	if (from > 0) from = text.indexOf(' ', from) + 1 || from;
	if (from > at) from = at;
	if (to < text.length) to = Math.max(at + q.length, text.lastIndexOf(' ', to));
	return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

/**
 * A result as its row: a rule always reads its name, its whole sentence, and
 * under it the words of its reason around what was typed when only the reason
 * holds them (criterion e11bf80b).
 */
function resultRow(e: SearchEntry, q: string): PaletteRow {
	const row = rowOf(e);
	if (e.k !== 'Rule' || has(e.t, q) || !e.body) return row;
	return { ...row, sub: snippet(e.body, q) };
}

export function paletteGroups(
	query: string,
	from: {
		readonly index: readonly SearchEntry[];
		readonly actions: readonly PaletteRow[];
		readonly projects: readonly PaletteRow[];
		readonly recent: readonly PaletteRow[];
		/** What was added to the project or changed in it lately, newest first (criterion e11bf80b). */
		readonly changed?: readonly PaletteRow[];
	}
): PaletteGroup[] {
	const q = query.trim().toLowerCase();
	const groups: PaletteGroup[] = q
		? [
				{ title: 'In this project', rows: searchResults(from.index, q).map((e) => resultRow(e, q)) },
				{ title: 'Actions', rows: from.actions.filter((a) => has(a.t, q)) },
				{ title: 'Other projects', rows: from.projects.filter((p) => has(p.t, q)).slice(0, OTHER_PROJECTS_MAX) }
			]
		: [
				{ title: 'Recent', rows: from.recent },
				{ title: 'Recently changed', rows: from.changed ?? [] },
				{ title: 'Actions', rows: from.actions }
			];
	return groups.filter((g) => g.rows.length > 0);
}

/** The name cut around the first place the query matches, so the palette marks the letters typed. */
export function marked(text: string, query: string): { readonly before: string; readonly match: string; readonly after: string } {
	const q = query.trim().toLowerCase();
	const at = q ? text.toLowerCase().indexOf(q) : -1;
	if (at < 0) return { before: text, match: '', after: '' };
	return { before: text.slice(0, at), match: text.slice(at, at + q.length), after: text.slice(at + q.length) };
}

const sameRow = (a: PaletteRow, b: PaletteRow) => (a.href ?? a.act) === (b.href ?? b.act);

/** Recent once a row was opened: it goes first, never twice, and the oldest gives way past five. */
export function remember(recent: readonly PaletteRow[], row: PaletteRow): PaletteRow[] {
	return [row, ...recent.filter((r) => !sameRow(r, row))].slice(0, RECENT_MAX);
}

/** Recent as this browser kept it; anything unreadable reads as nothing remembered. */
export function parseRecent(raw: string | null): PaletteRow[] {
	try {
		const list: unknown = JSON.parse(raw ?? '[]');
		if (!Array.isArray(list)) return [];
		return list
			.filter((r): r is PaletteRow => !!r && typeof r.t === 'string' && typeof r.g === 'string' && (typeof r.href === 'string' || r.act === 'new-project'))
			.map((r) => ({ g: r.g, t: r.t, p: typeof r.p === 'string' ? r.p : '', ...(r.href ? { href: r.href } : { act: r.act }) }))
			.slice(0, RECENT_MAX);
	} catch {
		return [];
	}
}
