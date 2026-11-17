/**
 * Where the documentation a Reverse-Specification reads is (criterion b6ad9ca2
 * of feat-ai-session): files the person's LLM opens on this computer (a folder,
 * else the repository it runs in), or links it opens on the web. Lyriks reads
 * neither itself: the prompt tells the LLM where to look, and only a web
 * address can go into it as a link, since a local path opens for no one else.
 *
 * Pure: shapes, parsing and the prompt's sentences only.
 */

export const DOCS_FROM = ['computer', 'links'] as const;
export type DocsFrom = (typeof DOCS_FROM)[number];
export const isDocsFrom = (v: unknown): v is DocsFrom => v === 'computer' || v === 'links';

export interface DocsLocation {
	readonly from: DocsFrom;
	/** On this computer: the folder to read; empty means the repository the LLM runs in. */
	readonly folder: string;
	/** Links: the lines the person wrote, as written; only the web addresses among them reach the prompt. */
	readonly links: readonly string[];
}

/** On this computer, no folder named: what a run reads before the person says otherwise. */
export const DEFAULT_DOCS_LOCATION: DocsLocation = { from: 'computer', folder: '', links: [] };

/** Bounds of what one run keeps: a folder path and a list of links, never a document. */
const MAX_FOLDER = 500;
const MAX_LINKS = 50;
const MAX_LINK = 2000;

const WEB = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
export const isWebAddress = (line: string): boolean => WEB.test(line.trim());

/** The lines of the links field: one per line, blanks dropped. */
export function linkLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, MAX_LINKS)
		.map((l) => l.slice(0, MAX_LINK));
}

/** The web addresses that go into the prompt, and the lines left out because they are not one. */
export function sortLinks(links: readonly string[]): { readonly web: readonly string[]; readonly refused: readonly string[] } {
	const web: string[] = [];
	const refused: string[] = [];
	for (const l of links) (isWebAddress(l) ? web : refused).push(l.trim());
	return { web: [...new Set(web)], refused };
}

/** A location as an act or a stored run carries it, bounded; anything unreadable reads as the default. */
export function parseDocsLocation(raw: unknown): DocsLocation {
	const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	return {
		from: isDocsFrom(o.from) ? o.from : 'computer',
		folder: typeof o.folder === 'string' ? o.folder.trim().slice(0, MAX_FOLDER) : '',
		links: Array.isArray(o.links) ? linkLines(o.links.filter((l): l is string => typeof l === 'string').join('\n')) : []
	};
}

/** Why the prompt cannot be handed yet, or null: Links chosen with no web address would read nothing. */
export function docsRefusal(loc: DocsLocation): string | null {
	return loc.from === 'links' && sortLinks(loc.links).web.length === 0 ? 'Add at least one link your LLM can open, or choose On this computer.' : null;
}

/** Where the documentation is, as the prompt says it to the LLM. */
export function docsWhere(loc: DocsLocation): string {
	if (loc.from === 'links') {
		const { web } = sortLinks(loc.links);
		return `The documentation is at these links: ${web.join(', ')}. Open each one yourself, directly or through a tool connected to you; for a link you cannot open, say so and name it, never guess what it says.`;
	}
	return loc.folder
		? `The documentation is on this computer, in the folder ${loc.folder}: read its documents (PDF, Word, Markdown, exports…).`
		: 'The documentation is on this computer, in the repository you run in: read its documents (PDF, Word, Markdown, exports…).';
}

/** How each document read is registered, so a citation opens for anyone (the sources reachability law). */
export function docsRegister(loc: DocsLocation): string {
	return loc.from === 'links'
		? 'Register each document you read in the documents section with its web address.'
		: 'Register each document you read in the documents section with its text stored (attach_source), never a local path as its address: no one else can open it.';
}
