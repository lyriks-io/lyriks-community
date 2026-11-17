/**
 * The navigation of the Specification 360°: six chapters from the big picture
 * to the details and the tabs of Tech and data. Pages are addressed by their
 * path under `/projects/<id>/spec`.
 */

export type Chapter = 'home' | 'features' | 'users' | 'experience' | 'tech' | 'glossary';

export const CHAPTERS: readonly { readonly id: Chapter; readonly label: string; readonly path: string }[] = [
	{ id: 'home', label: 'Overview', path: '' },
	{ id: 'features', label: 'Features', path: 'features' },
	{ id: 'users', label: 'Users', path: 'users' },
	{ id: 'experience', label: 'Experience', path: 'experience' },
	{ id: 'tech', label: 'Technology & data', path: 'tech/data-map' },
	{ id: 'glossary', label: 'Glossary', path: 'glossary' }
];

export const TECH_TABS: readonly { readonly path: string; readonly label: string }[] = [
	{ path: 'tech/data-map', label: 'Data map' },
	{ path: 'tech/architecture', label: 'Architecture' },
	{ path: 'tech/operations', label: 'Operations' },
	{ path: 'tech/requirements', label: 'Requirements' },
	// The register of the sources the spec rests on (criterion b0ea9889).
	{ path: 'tech/sources', label: 'Sources' }
];

/** The page path under /spec from a URL pathname ('' is At a glance). */
export function specPathOf(pathname: string, projectId: string): string {
	const base = `/projects/${projectId}/spec`;
	const encoded = `/projects/${encodeURIComponent(projectId)}/spec`;
	const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.startsWith(encoded) ? pathname.slice(encoded.length) : '';
	return decodeURIComponent(rest.replace(/^\/+|\/+$/g, ''));
}

export function chapterOf(path: string): Chapter {
	const head = path.split('/')[0];
	if (head === 'features' || head === 'users' || head === 'experience' || head === 'tech' || head === 'glossary') return head;
	return 'home';
}

/** Where a chapter opens: each on its own page, Features on the list of the core features (criterion 64fa19d5). */
export function chapterPath(chapter: Chapter): string {
	return CHAPTERS.find((c) => c.id === chapter)?.path ?? '';
}

/** A core feature's page, which lists its features (criterion 64fa19d5). */
export function corePath(coreId: string): string {
	return `features/${coreId}`;
}
