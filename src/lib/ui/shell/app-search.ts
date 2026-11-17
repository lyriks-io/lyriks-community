/**
 * The index behind the search palette: the pages of the navigation and every
 * object of the current project, each a title, a kind and an address.
 * Pure, so the matching rules are tested without a browser.
 */
export interface SearchEntry {
	/** What the reader looks for: a page, a feature, a term, a rule's sentence… */
	readonly t: string;
	/** Where it belongs, shown on the right of the result. */
	readonly k: string;
	readonly href: string;
	/** Where it sits when its kind does not say it: a rule's feature and action. */
	readonly at?: string;
	/** More words it is found by: a rule's reason. */
	readonly body?: string;
}

const MAX_RESULTS = 8;

/** The pages every project has, under the names the navigation gives them. */
export function pageEntries(projectId: string | null): SearchEntry[] {
	const entries: SearchEntry[] = [{ t: 'Home', k: 'Page', href: '/' }];
	if (!projectId) return entries;
	const base = `/projects/${encodeURIComponent(projectId)}`;
	const spec = (t: string, path: string): SearchEntry => ({ t, k: 'Knowledge', href: `${base}/spec${path}` });
	return [
		...entries,
		{ t: 'Changes', k: 'Page', href: `${base}/evolution` },
		{ t: 'Reverse', k: 'Page', href: `${base}/retrospec` },
		{ t: 'Knowledge', k: 'Page', href: `${base}/spec` },
		{ t: 'Health', k: 'Page', href: `${base}/spec/noticed` },
		spec('Overview', ''),
		spec('Users', '/users'),
		spec('Experience', '/experience'),
		spec('Data map', '/tech/data-map'),
		spec('Architecture', '/tech/architecture'),
		spec('Operations', '/tech/operations'),
		spec('Requirements', '/tech/requirements'),
		spec('Glossary', '/glossary'),
		{ t: 'Generate specs', k: 'Page', href: `${base}/generate` }
	];
}

/**
 * The entries whose title or kind holds the query, the closest titles first, at
 * most eight. A rule is found anywhere in its sentence or its reason, and ranks
 * after every named thing that matches, so its many words never crowd out a
 * page, a feature or a term (criterion e11bf80b).
 */
export function searchResults(index: readonly SearchEntry[], query: string): SearchEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const named = (e: SearchEntry): number => {
		const t = e.t.toLowerCase();
		if (t === q) return 0;
		if (t.startsWith(q)) return 1;
		if (t.includes(q)) return 2;
		return `${t} ${e.k.toLowerCase()}`.includes(q) ? 3 : -1;
	};
	const rank = (e: SearchEntry): number => {
		if (e.k !== 'Rule') return named(e);
		if (e.t.toLowerCase().includes(q)) return 4;
		return e.body?.toLowerCase().includes(q) ? 5 : -1;
	};
	return index
		.map((e, i) => ({ e, i, r: rank(e) }))
		.filter((x) => x.r >= 0)
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.slice(0, MAX_RESULTS)
		.map((x) => x.e);
}
