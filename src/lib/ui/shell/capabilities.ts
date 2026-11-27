import type { IconName } from '$ui/design-system';
import type { Tier } from '$domain/tier';

/**
 * The capability registry — the post-wizard information architecture, matching
 * the v3 mockup prototype's left sidebar. Lyriks is no longer an
 * 11-step linear wizard; it's a flat set of capabilities a team moves between
 * freely. The sidebar, tier gating, "Fix now" routing and the
 * legacy redirects all read from here. Order here == sidebar order.
 *
 * The rail is deliberately UNCATEGORIZED: one flat list, no Specify/Validate/
 * Deliver headers. The groups implied a sequence the product does not enforce,
 * and every capability is reachable at any time.
 *
 * `status:'hidden'` = reachable by deep link but NOT in the left nav. Architecture
 * folds into Infrastructure; Canvas / Team / Audit are top-bar
 * + dock surfaces, not left-nav entries (as in the v3 prototype). Pre-fold
 * section ids live on as `legacyIds` entries on their host capability, so a
 * stored id still resolves without naming a dead page.
 */

export type CapabilityStatus = 'built' | 'hidden';

export interface Capability {
	id: string;
	title: string;
	subtitle: string;
	icon: IconName;
	tier: Tier;
	status: CapabilityStatus;
	/**
	 * The page a capability navigates to. OPTIONAL: a capability without a page
	 * has no route, and advertising one that 404s is the bug MR 9 removes.
	 * Consumers must treat a missing route as "not navigable".
	 */
	route?: (projectId: string) => string;
	partOf?: string;
	legacyIds?: string[];
	/** Set apart at the foot of the left nav on a background of its own. */
	featured?: boolean;
	/** A gear at the very foot of the left nav, never among the pages that describe the product: the project's Settings (ac-proj-settings). */
	foot?: boolean;
	/** Shown only to whoever administers the project (ac-proj-settings). */
	adminOnly?: boolean;
}

export const projectRoute = (id: string) => (projectId: string) => `/projects/${projectId}/${id}`;

// The Enterprise overlay (src/lib/ee, linked from ee/) may add capabilities;
// the glob resolves to nothing in the open-source tree.
const overlayModules = import.meta.glob<{ EE_CAPABILITIES: Capability[] }>(
	'/src/lib/ee/ui/shell/capabilities.ts',
	{ eager: true }
);
function overlayCapabilities(): Capability[] {
	return Object.values(overlayModules).flatMap((m) => m.EE_CAPABILITIES ?? []);
}

// Order == sidebar order (the v3 prototype).
export const CAPABILITIES: Capability[] = [
	{
		// NOT NAVIGABLE — deliberately no `route`. The scope ledger is authored by the
		// modelling agent and drives the completion gate through the MCP and the JSON
		// API; none of it is surfaced in the product for now. The id stays registered
		// so the section keeps a title and help entry, and so stored references
		// resolve to a name rather than a dead string.
		id: 'scope',
		title: 'Scope coverage',
		subtitle: 'External inventory & completion gate',
		icon: 'target',
		tier: 'oss',
		status: 'hidden'
	},
	{
		// legacyIds exist only so stored deep-links (pre-fold coherence gaps, bookmarks) still resolve.
		id: 'foundation',
		title: 'Foundation',
		subtitle: 'Brief, business, market, tech, security & ops',
		icon: 'sparkles',
		tier: 'oss',
		status: 'built',
		route: projectRoute('foundation'),
		legacyIds: ['initialization', 'framing', 'foundations']
	},
	{
		id: 'features',
		title: 'Features',
		subtitle: 'Tree of features',
		icon: 'grid',
		tier: 'oss',
		status: 'built',
		route: projectRoute('features')
	},
	{
		id: 'users',
		title: 'Users & Permissions',
		subtitle: 'Personas & access matrix',
		icon: 'users',
		tier: 'oss',
		status: 'built',
		route: projectRoute('users')
	},
	{
		id: 'experience',
		title: 'Experience',
		subtitle: 'Design system, journeys & screens',
		icon: 'monitor',
		tier: 'oss',
		status: 'built',
		route: projectRoute('experience')
	},
	{
		// Merged into Features as its "Behavior" tab. Kept as a hidden alias so old
		// deep-links + a "Fix now" link of What Lyriks noticed resolve to the merged tab (its route
		// redirects to /features?tab=behavior); not a left-nav entry.
		id: 'functional',
		title: 'Functional',
		subtitle: 'Behavior overview: surfaces, actions & scenarios',
		icon: 'cpu',
		tier: 'oss',
		status: 'hidden',
		partOf: 'features',
		route: (projectId) => `/projects/${projectId}/features?tab=behavior`
	},
	{
		// Merged into Users & Permissions as the "Access matrix" tab — kept for
		// deep-link + a "Fix now" link of What Lyriks noticed (its route redirects to
		// /users?tab=permissions); not a left-nav entry.
		id: 'permissions',
		title: 'Permissions',
		subtitle: 'Access matrix, who can do what',
		icon: 'shield',
		tier: 'oss',
		status: 'hidden',
		route: projectRoute('permissions'),
		partOf: 'users'
	},
	{
		id: 'infrastructure',
		title: 'Tech & Data',
		subtitle: 'Hosts, databases, entities & stack',
		icon: 'server',
		tier: 'oss',
		status: 'built',
		route: projectRoute('infrastructure'),
		legacyIds: ['data']
	},
	{
		// Merged into the "Tech & Data" page (Infrastructure). Kept as a
		// hidden alias so a "Fix now" link of What Lyriks noticed + legacy deep links resolve to
		// the merged page's architecture section instead of a retired route.
		id: 'architecture',
		title: 'Architecture & Constraints',
		subtitle: 'Reference docs, non-negotiables',
		icon: 'file-check',
		tier: 'oss',
		status: 'hidden',
		partOf: 'infrastructure',
		route: (projectId) => `/projects/${projectId}/infrastructure#architecture`
	},
	{
		// Merged into Features as its "Rules" tab. Kept as a hidden alias so old
		// deep-links + a "Fix now" link of What Lyriks noticed resolve to the merged tab (its route
		// redirects to /features?tab=rules); not a left-nav entry.
		id: 'rules',
		title: 'Acceptance criteria',
		subtitle: 'Rules where they belong, and acceptance criteria on their feature',
		icon: 'sliders',
		tier: 'oss',
		status: 'hidden',
		// Rules have no tab: acceptance criteria sit on their feature in the tree.
		route: (projectId) => `/projects/${projectId}/features?tab=tree`,
		// Folds under Features for cross-links so the Rules dimension resolves to a
		// visible left-nav entry (the name + route a point's Fix now names).
		partOf: 'features'
	},
	{
		// Deep-linkable, off the left nav.
		id: 'documents',
		title: 'Documents & Sources',
		subtitle: 'Interviews, research, links & evidence',
		icon: 'book',
		tier: 'oss',
		status: 'hidden',
		route: projectRoute('documents')
	},
	{
		// Hidden for now: the Features tab that hosted it is no longer surfaced, so
		// cross-links (and the legacy /reuse route) land on Features itself.
		id: 'reuse',
		title: 'Reuse library',
		subtitle: 'Share requirements across projects',
		icon: 'download',
		tier: 'oss',
		status: 'hidden',
		route: projectRoute('features'),
		partOf: 'features'
	},
	{
		id: 'glossary',
		title: 'Glossary',
		subtitle: 'Canonical terms, synonyms',
		icon: 'tag',
		tier: 'oss',
		status: 'built',
		route: projectRoute('glossary')
	},
	{
		// A page of its own, set apart at the foot of the rail (featured): the
		// pages above it describe the product as it is, Evolution changes it over
		// time across all of them. A kept /features?tab=evolution link redirects here.
		id: 'evolution',
		title: 'Evolution',
		subtitle: 'Change requests, from the need to acceptance',
		icon: 'rotate',
		tier: 'oss',
		status: 'built',
		featured: true,
		route: projectRoute('evolution')
	},
	{
		// There is no Control Center and no page of scores any more (criteria
		// ef42a85d, 799e1f5b): every point Lyriks noticed is listed on the page What
		// Lyriks noticed of the Specification 360° (criterion 55a7fe86). Kept as a
		// hidden capability so a gap whose fix has no page of its own, and every
		// stored /coherence link, still land there (the old route redirects).
		id: 'coherence',
		title: 'Health',
		subtitle: 'Every point that weighs on the project health',
		icon: 'gauge',
		tier: 'oss',
		status: 'hidden',
		route: (projectId) => `/projects/${projectId}/spec/noticed`
	},
	{
		// Merged into "Tech & Data" as its "Knowledge graph" tab: the graph is
		// the whole model seen at once, which belongs beside the data spine rather
		// than as a page of its own. Kept as a hidden alias so the Fix of a
		// point + the legacy /graph route resolve to the merged tab.
		id: 'graph',
		title: 'Knowledge graph',
		subtitle: 'The whole project as one graph',
		icon: 'layers',
		tier: 'oss',
		status: 'hidden',
		partOf: 'infrastructure',
		route: (projectId) => `/projects/${projectId}/infrastructure?tab=graph`
	},
	// Enterprise-only capabilities (Settings, Team) are registered by the
	// Enterprise overlay when it is compiled in; see `overlayCapabilities` below.
	...overlayCapabilities()
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

/** Look up a capability by id (or by a legacy step id). */
export function capabilityById(id: string): Capability | undefined {
	const direct = BY_ID.get(id);
	if (direct) return direct;
	return CAPABILITIES.find((c) => c.legacyIds?.includes(id));
}

/**
 * Resolve a step/dimension id to the left-nav capability that owns its fix,
 * following `partOf` until a non-hidden capability. This is what lets the
 * Fix now of a point label it with the SAME name + route as the sidebar entry
 * the user would click (e.g. `architecture` → Tech & Data, a stored
 * legacy id → Foundation). Returns undefined when the chain never reaches a visible
 * capability, so the caller can fall back to the raw dimension label.
 */
export function resolveVisibleCapability(id: string): Capability | undefined {
	let cap = capabilityById(id);
	const seen = new Set<string>();
	while (cap && cap.status === 'hidden' && cap.partOf && !seen.has(cap.id)) {
		seen.add(cap.id);
		cap = BY_ID.get(cap.partOf);
	}
	return cap && cap.status !== 'hidden' ? cap : undefined;
}

/**
 * The left nav: every visible capability, one flat list in registry order, the
 * ones set apart (featured) after it whatever registers after them, and at its
 * very foot the project's Settings an overlay registers (ac-proj-settings).
 */
const VISIBLE = CAPABILITIES.filter((c) => c.status !== 'hidden');
export const NAV_CAPABILITIES = [...VISIBLE.filter((c) => !c.featured && !c.foot), ...VISIBLE.filter((c) => c.featured && !c.foot), ...VISIBLE.filter((c) => c.foot)];

/** The sections a capability holds (the Team in Settings): the menu its gear opens lists them (ac-proj-settings). */
export const sectionsOf = (id: string): Capability[] => CAPABILITIES.filter((c) => c.partOf === id && c.route);

/** The entries of the left nav one reader is shown: an admin-only entry only to whoever administers the project. */
export const navCapabilitiesFor = (administers: boolean): Capability[] => NAV_CAPABILITIES.filter((c) => !c.adminOnly || administers);
