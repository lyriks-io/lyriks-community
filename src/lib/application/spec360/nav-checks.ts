import type { ElementStanding, SpecElement } from '$domain/retrospec';

/**
 * The entries of the navigation's Specification 360° track that read validated
 * while the specification is a draft (criterion 8e942b12): an entry carries its
 * green check once every element it shows is validated by everyone it waits
 * on, and one that shows no element carries none.
 *
 * The keys, each element in the one place the pages show it:
 *  - `overview`: the product summary, the current and the target situation;
 *  - `feature:<id>`: a feature, its actions, their rules and its journey;
 *  - `core:<id>`: a core feature's own element, which the navigation reads with
 *    each of its features (it holds the outline that ties them);
 *  - `features`: every core feature and feature with the product's rules;
 *  - `role:<id>`, `users:permissions` (Who can do what), then `users` with both;
 *  - `experience:journeys`, `experience:design` (the branding, the components), `experience`;
 *  - `tech:data-map`, `tech:architecture`, `tech:health`, `tech:requirements` (with the constraints), `tech`;
 *  - `glossary`: its terms.
 */
export function navChecks(elements: readonly SpecElement[], standings: Readonly<Record<string, ElementStanding>>): string[] {
	const groups = new Map<string, boolean>();
	const add = (key: string, ok: boolean) => groups.set(key, (groups.get(key) ?? true) && ok);
	for (const element of elements) {
		const ok = standings[element.id]?.state === 'ok';
		for (const key of entriesOf(element.id)) add(key, ok);
	}
	return [...groups].filter(([, ok]) => ok).map(([key]) => key);
}

/** The elements a tab of Knowledge shows (`features`, `users`, `experience`, `tech`, `glossary`, `overview`). */
export function tabAnchors(elements: readonly SpecElement[], tab: string): string[] {
	return elements.filter((e) => entriesOf(e.id).includes(tab)).map((e) => e.id);
}

/**
 * The elements a page of Knowledge shows when it hands no scope of its own (criterion c509fa9c), read from its tab
 * and the view under it (the path's segment after the tab): what the band counts and its Validate the whole section
 * validates. A tab's own page shows the whole tab; one profile shows itself, Who can do what the permissions, a view
 * of Technology & data its own elements (Operations shows the health items), Sources none.
 */
export function viewAnchors(elements: readonly SpecElement[], tab: string, view: string | null): string[] {
	return tabAnchors(elements, viewEntry(tab, view));
}

function viewEntry(tab: string, view: string | null): string {
	if (!view) return tab;
	if (tab === 'users') return view === 'matrix' ? 'users:permissions' : `role:${view}`;
	if (tab === 'tech') return `tech:${view === 'operations' ? 'health' : view}`;
	return tab;
}

/** The entries an element counts in: its own, then the fold it sits under. */
function entriesOf(id: string): string[] {
	const [kind, first = ''] = id.split(':');
	switch (kind) {
		case 'product':
		case 'problem':
		case 'target':
			return ['overview'];
		case 'core':
			return [`core:${first}`, 'features'];
		case 'feature':
		case 'action':
		case 'flow':
			return [`feature:${first}`, 'features'];
		case 'rule':
			// A rule of the product as a whole sits on the Features page; any other belongs to its feature.
			return first === 'project' ? ['features'] : [`feature:${first}`, 'features'];
		case 'role':
			return [`role:${first}`, 'users'];
		case 'permissions':
			return ['users:permissions', 'users'];
		case 'journey':
			return ['experience:journeys', 'experience'];
		case 'branding':
		case 'component':
			return ['experience:design', 'experience'];
		case 'datamap':
		case 'data':
			return ['tech:data-map', 'tech'];
		case 'stack':
			return ['tech:architecture', 'tech'];
		case 'health':
			return ['tech:health', 'tech'];
		case 'requirements':
		case 'constraint':
			return ['tech:requirements', 'tech'];
		case 'term':
			return ['glossary'];
		default:
			return [];
	}
}
