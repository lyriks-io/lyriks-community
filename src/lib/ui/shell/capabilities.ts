import type { IconName } from '$ui/design-system';
import type { Tier } from '$domain/tier/tier';

/**
 * The capability registry — the post-wizard information architecture, matching
 * the v3 mockup prototype's left sidebar. Lyriks is no longer an
 * 11-step linear wizard; it's a flat set of capabilities a team moves between
 * freely. The sidebar, tier gating, Control Center "Fix-Now" routing and the
 * legacy redirects all read from here. Order here == sidebar order.
 *
 * The rail is deliberately UNCATEGORIZED: one flat list, no Specify/Validate/
 * Deliver headers. The groups implied a sequence the product does not enforce,
 * and every capability is reachable at any time.
 *
 * `status:'hidden'` = reachable by deep link but NOT in the left nav. Architecture
 * folds into Infrastructure; Control Center / Canvas / Team / Audit are top-bar
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
	 * The page a capability navigates to. OPTIONAL: docked-panel capabilities (the
	 * Control Center) live in the right rail and are opened by a button/shortcut,
	 * not a URL — they have no page route, and advertising one that 404s is the bug
	 * MR 9 removes. Consumers must treat a missing route as "not navigable".
	 */
	route?: (projectId: string) => string;
	partOf?: string;
	legacyIds?: string[];
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
		id: 'users',
		title: 'Users & Permissions',
		subtitle: 'Personas & access matrix',
		icon: 'users',
		tier: 'oss',
		status: 'built',
		route: projectRoute('users')
	},
	{
		id: 'features',
		title: 'Features',
		subtitle: 'Tree, roadmap & work queue',
		icon: 'grid',
		tier: 'oss',
		status: 'built',
		route: projectRoute('features')
	},
	{
		id: 'experience',
		title: 'Experience',
		subtitle: 'Live demo, journeys & library',
		icon: 'monitor',
		tier: 'oss',
		status: 'built',
		route: projectRoute('experience')
	},
	{
		// Merged into Features as its "Behavior" tab. Kept as a hidden alias so old
		// deep-links + Control Center "Fix now" resolve to the merged tab (its route
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
		// deep-link + Control Center "Fix now" (its route redirects to
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
		title: 'Data & Architecture',
		subtitle: 'Hosts, databases, entities & stack',
		icon: 'server',
		tier: 'oss',
		status: 'built',
		route: projectRoute('infrastructure'),
		legacyIds: ['data']
	},
	{
		// Merged into the "Data & Architecture" page (Infrastructure). Kept as a
		// hidden alias so Control Center "Fix now" + legacy deep links resolve to
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
		// deep-links + Control Center "Fix now" resolve to the merged tab (its route
		// redirects to /features?tab=rules); not a left-nav entry.
		id: 'rules',
		title: 'Rules & edge cases',
		subtitle: 'Unified inventory, conflicts & acceptance tests',
		icon: 'sliders',
		tier: 'oss',
		status: 'hidden',
		route: (projectId) => `/projects/${projectId}/features?tab=rules`,
		// Folds under Features for cross-links so the Rules dimension resolves to a
		// visible left-nav entry (Control Center card name + route).
		partOf: 'features'
	},
	{
		// Relocated to the header user-menu "Project tools" section (see
		// PROJECT_TOOL_CAPABILITIES); deep-linkable, off the left nav.
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
		// Scores/maturity now live ONLY in the Control Center (the right rail), so the
		// dedicated page is off the left nav. Kept deep-linkable (status:'hidden') so
		// Control Center "Fix now" + legacy links still resolve, and so the spec
		// generator (guarantee tiers, threshold, Generate specs) it hosts stays reachable.
		id: 'coherence',
		title: 'Project health',
		subtitle: 'Coverage, coherence, readiness & maturity',
		icon: 'gauge',
		tier: 'oss',
		status: 'hidden',
		route: projectRoute('coherence')
	},
	{
		// Off the left nav; deep-linkable + Control Center "Fix now" resolvable.
		id: 'traceability',
		title: 'Traceability',
		subtitle: 'Requirement links & coverage gaps',
		icon: 'list',
		tier: 'oss',
		status: 'hidden',
		route: projectRoute('traceability')
	},
	{
		// Merged into "Data & Architecture" as its "Knowledge graph" tab: the graph is
		// the whole model seen at once, which belongs beside the data spine rather
		// than as a page of its own. Kept as a hidden alias so Control Center
		// "Fix now" + the legacy /graph route resolve to the merged tab.
		id: 'graph',
		title: 'Knowledge graph',
		subtitle: 'The whole project as one graph',
		icon: 'layers',
		tier: 'oss',
		status: 'hidden',
		partOf: 'infrastructure',
		route: (projectId) => `/projects/${projectId}/infrastructure?tab=graph`
	},
	{
		// WITHDRAWN from the product: no left-nav entry, no sidebar footer card, and
		// NOT NAVIGABLE — deliberately no `route`, so nothing in the app can build a
		// link to it and the page itself answers 404. The id stays registered so the
		// section keeps a title and a help entry, and so a stored reference resolves
		// to a name rather than a dead string; the draft, `/api/draft/supervision`
		// and the MCP `supervision` section are untouched and still authorable.
		id: 'supervision',
		title: 'Supervision',
		subtitle: 'Spec-driven AI policy, budgets & traceability',
		icon: 'eye',
		tier: 'oss',
		status: 'hidden'
	},
	{
		// Merged into Traceability as its "Baselines" tab (matching the prototype).
		// Kept as a hidden alias so Control Center "Fix now" + legacy deep links
		// resolve to the merged tab instead of a retired route.
		id: 'baselines',
		title: 'Baselines',
		subtitle: 'Named versions, snapshots & comparison',
		icon: 'flag',
		tier: 'oss',
		status: 'hidden',
		partOf: 'traceability',
		route: (projectId) => `/projects/${projectId}/traceability?tab=baselines`
	},
	{
		// Merged into Traceability as its "Approvals" tab (matching the prototype).
		// Kept as a hidden alias so Control Center "Fix now" + legacy deep links
		// resolve to the merged tab instead of a retired route.
		id: 'approvals',
		title: 'Approvals',
		subtitle: 'Sign-off, reviews & accepted risks',
		icon: 'file-check',
		tier: 'oss',
		status: 'hidden',
		partOf: 'traceability',
		route: (projectId) => `/projects/${projectId}/traceability?tab=approvals`
	},
	{
		// Merged into Supervision as its "AI Gateway" tab — and withdrawn with it.
		// NOT NAVIGABLE: its route used to redirect into /supervision, which is now
		// unreachable, so advertising one would only lead to a 404. The FinOps draft
		// and `/api/finops` are unchanged.
		id: 'finops',
		title: 'AI Cost Governor',
		subtitle: 'LiteLLM FinOps from readiness & coherence',
		icon: 'cpu',
		tier: 'oss',
		status: 'hidden',
		partOf: 'supervision'
	},
	// ── Shell capabilities (top bar + docked panels, NOT left-nav) ──
	{
		id: 'control-center',
		title: 'Control Center',
		subtitle: 'Deep coherence cockpit',
		icon: 'target',
		tier: 'oss',
		status: 'hidden'
		// No route: the Control Center is a docked right-rail panel opened by the
		// Sidebar's Build Readiness button (⌘/Ctrl-J), not a page. There is no
		// /projects/<id>/control-center route.
	},
	// Enterprise-only capabilities (Team, Manager & Audit) are registered by the
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
 * Control Center label a card with the SAME name + route as the sidebar entry
 * the user would click (e.g. `architecture` → Data & Architecture, a stored
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

/** The left nav: every visible capability, one flat list in registry order. */
export const NAV_CAPABILITIES = CAPABILITIES.filter((c) => c.status !== 'hidden');

/**
 * Capabilities relocated out of the left nav into the header user-menu's
 * "Project tools" section — still first-class, just not everyday rail entries.
 * Order here == menu order. Documents & Sources is the evidence register every
 * other capability cites, so it belongs here rather than in the rail. Reuse is
 * hidden for now — no menu entry, no Features tab.
 *
 * Traceability is deliberately absent: it stays deep-linkable (Control Center
 * "Fix now", /baselines + /approvals redirects) but is off the menu until its
 * role in the product is settled.
 */
export const PROJECT_TOOL_CAPABILITIES: Capability[] = ['documents']
	.map((id) => BY_ID.get(id))
	.filter((c): c is Capability => c !== undefined);
