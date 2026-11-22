/**
 * Where the address of a project page the navigation no longer leads to lands
 * now (criterion 84162c34): the page of Knowledge that holds what the old page
 * held, so a bookmark, a notification or an older answer of an AI still opens
 * something, and no old editor shows outside Knowledge. Pure, so every
 * mapping is tested without a server.
 */

export type LegacyPage =
	| 'foundation'
	| 'initialization'
	| 'framing'
	| 'scope'
	| 'features'
	| 'functional'
	| 'rules'
	| 'reuse'
	| 'users'
	| 'permissions'
	| 'experience'
	| 'infrastructure'
	| 'data'
	| 'documents'
	| 'glossary';

/** The tabs Foundation had before it became the Brief alone; their questions are asked in Requirements. */
const REQUIREMENT_TABS = new Set(['requirements', 'technical', 'security', 'ops']);

/** The query kept on arrival, or nothing when none of its keys is read there. */
function keep(query: URLSearchParams, keys: readonly string[]): string {
	const kept = new URLSearchParams();
	for (const [key, value] of query) if (keys.includes(key)) kept.append(key, value);
	const text = kept.toString();
	return text ? `?${text}` : '';
}

/** The feature or core feature an old Features address named, to open its own page. */
export function legacyFeatureId(query: URLSearchParams): string | null {
	return query.get('feature') || query.get('leaf') || null;
}

/**
 * The address an old page sends its reader to. `knownFeature` says whether an
 * id an old Features address names has a page of its own: an id that has none
 * (a family of the old tree, a feature since removed) opens the list instead.
 */
export function legacyPageTarget(projectId: string, page: LegacyPage, query: URLSearchParams, knownFeature = false): string {
	const project = `/projects/${encodeURIComponent(projectId)}`;
	const spec = `${project}/spec`;
	const tab = query.get('tab') ?? '';
	switch (page) {
		case 'foundation':
		case 'initialization':
		case 'framing':
		case 'scope':
			return REQUIREMENT_TABS.has(tab) ? `${spec}/tech/requirements` : spec;
		case 'features':
		case 'functional':
		case 'rules':
		case 'reuse': {
			// The Evolution tab of the old Features became Changes. The Roadmap tab is
			// gone: a bookmark of it lands on Changes, where it lived last (rule aa3941d5).
			if (tab === 'roadmap') return `${project}/evolution`;
			if (tab === 'evolution') {
				const rest = new URLSearchParams(query);
				rest.delete('tab');
				const text = rest.toString();
				return `${project}/evolution${text ? `?${text}` : ''}`;
			}
			const id = legacyFeatureId(query);
			return id && knownFeature ? `${spec}/features/${encodeURIComponent(id)}` : `${spec}/features`;
		}
		case 'users':
			return tab === 'permissions' ? `${spec}/users/matrix` : `${spec}/users`;
		case 'permissions':
			return `${spec}/users/matrix`;
		case 'experience':
			return `${spec}/experience`;
		case 'infrastructure':
		case 'data':
			if (tab === 'requirements') return `${spec}/tech/requirements`;
			if (tab === 'stack') return `${spec}/tech/architecture`;
			return `${spec}/tech/data-map${keep(query, ['database'])}`;
		case 'documents':
			return `${spec}/tech/sources${keep(query, ['source', 'from'])}`;
		case 'glossary':
			return `${spec}/glossary${keep(query, ['term'])}`;
	}
}
