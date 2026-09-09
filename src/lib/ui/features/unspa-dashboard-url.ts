/**
 * Deep links into the Unspaghettit behavior dashboard.
 *
 * Single place that knows where the dashboard lives and that every link Lyriks
 * hands out carries `?brand=lyriks` (Lyriks livery on the dashboard side) plus
 * `user=<active member>` (so the dashboard attributes edits to who opened it).
 */
import { browser, dev } from '$app/environment';
import { page } from '$app/state';
import { env } from '$env/dynamic/public';
import { memberNameFromEmail } from '$domain/team/member-name';
import type { RuleOrigin } from '$application/index-feature-rules';

/** Default appliance port of the behavior dashboard. */
const DASHBOARD_PORT = '3003';

/** Marks the dashboard as opened from Lyriks (drives its branded chrome). */
const BRAND_PARAM = 'brand=lyriks';

/**
 * Marks the dashboard as FRAMED by Lyriks. Its own contract for "the host owns
 * the chrome": it drops its header, banners, tour and floating widgets, so an
 * embedded panel reads as one Lyriks tab instead of a second application nested
 * inside this one. Only for iframes: a link opened in a new tab still needs the
 * dashboard's own header to be navigable.
 */
const EMBED_PARAM = 'embed=1';

/**
 * Base URL of the dashboard: the configured one, else the host the user is
 * actually on, on the editor's default port — NEVER 127.0.0.1, which on a
 * network appliance would point at the visitor's own machine. `null` during SSR
 * with no config; links then render after hydration.
 */
export function unspaDashboardBase(): string | null {
	// Production editor access must pass through the platform authorization gate.
	if (!dev) return '/behavior';
	const configured = env.PUBLIC_UNSPA_DASHBOARD_URL?.trim();
	if (configured) return configured.replace(/\/$/, '');
	if (browser) return `${location.protocol}//${location.hostname}:${DASHBOARD_PORT}`;
	return null;
}

/**
 * The active member's display name: the workspace member name (or solo builder
 * name) resolved server-side and carried in layout data, falling back to the
 * email-derived form if that ever hasn't landed. Reading the reactive `page`
 * keeps every link current without threading the name through props.
 */
function activeMemberName(): string {
	const data = page.data as { memberName?: string; session?: { email?: string } } | undefined;
	return data?.memberName?.trim() || memberNameFromEmail(data?.session?.email);
}

/** Brand- and user-tagged dashboard link for `path` (e.g. `/projects/x`). */
export function unspaDashboardHref(path: string, base = unspaDashboardBase()): string | null {
	return dashboardLink(path, base, [BRAND_PARAM]);
}

/**
 * The same link, additionally marked as embedded, for an `<iframe src>`. The
 * dashboard then renders its content alone and Lyriks supplies the chrome
 * around it.
 */
export function unspaEmbedHref(path: string, base = unspaDashboardBase()): string | null {
	return dashboardLink(path, base, [BRAND_PARAM, EMBED_PARAM]);
}

/** Appends the host context (`extra` + the active member) to a dashboard path. */
function dashboardLink(path: string, base: string | null, extra: string[]): string | null {
	if (!base) return null;
	const suffix = path.startsWith('/') ? path : `/${path}`;
	const query = [...extra, `user=${encodeURIComponent(activeMemberName())}`].join('&');
	return `${base}${suffix}${suffix.includes('?') ? '&' : '?'}${query}`;
}

/** Brand-tagged link to one project's behavior model. */
export function unspaProjectHref(projectId: string, base = unspaDashboardBase()): string | null {
	return unspaDashboardHref(`/projects/${encodeURIComponent(projectId)}`, base);
}

/**
 * Bare dashboard route of a single feature, without base or brand context.
 * For the EMBEDDED editor (BehaviorEditorFrame), which adds those itself.
 */
export function unspaFeaturePath(featureId: string): string {
	return `/features/${encodeURIComponent(featureId)}`;
}

/** Brand-tagged link to a single feature (the dashboard routes them here). */
export function unspaFeatureHref(featureId: string, base = unspaDashboardBase()): string | null {
	return unspaDashboardHref(unspaFeaturePath(featureId), base);
}

/**
 * Bare dashboard route of a single ACTION: its feature, with the surface that
 * hosts it selected and the action's own card expanded. `focus=action:<id>`
 * names the `data-focus-target` the editor renders on every action card, so the
 * user lands on the action they clicked instead of on the surface around it.
 * For the EMBEDDED editor; `unspaActionHref` is the same target as a full link.
 */
export function unspaActionPath(featureId: string, surfaceId: string, actionId: string): string {
	const parts: string[] = [];
	if (surfaceId) parts.push(`surface=${encodeURIComponent(surfaceId)}`);
	if (actionId) parts.push(`focus=${encodeURIComponent(`action:${actionId}`)}`);
	const query = parts.length ? `?${parts.join('&')}` : '';
	return `${unspaFeaturePath(featureId)}${query}`;
}

/** Brand-tagged link to a single action, for a dedicated new-tab affordance. */
export function unspaActionHref(
	featureId: string,
	surfaceId: string,
	actionId: string,
	base = unspaDashboardBase()
): string | null {
	return unspaDashboardHref(unspaActionPath(featureId, surfaceId, actionId), base);
}

/**
 * The IN-APP home of every behavior link: the Features section's Behavior tab,
 * whose embedded editor opens on `path` (a dashboard route from the builders
 * above; null or omitted = the project itself).
 *
 * The rule for the whole app: a behavior link stays inside Lyriks. Only a
 * DEDICATED "open in a dedicated tab" affordance next to it hands out a
 * `unspa*Href` with `target="_blank"`. Use this one from another page; on the
 * Features page itself, call the page's `onOpenEditor` callback instead, which
 * switches tab without a round-trip.
 */
export function behaviorTabHref(projectId: string, path?: string | null): string {
	const parts = ['tab=behavior'];
	if (path) parts.push(`editor=${encodeURIComponent(path)}`);
	return `/projects/${encodeURIComponent(projectId)}/features?${parts.join('&')}`;
}

/**
 * Deep link that opens the behavior editor on the exact tab that edits one
 * rule/invariant, per the dashboard contract
 * (`/features/<id>?tab=&surface=&panel=&focus=`):
 *   surface rule       → ?surface=<sid>&panel=rules&focus=rule:<id>
 *   action rule        → ?surface=<sid>&focus=rule:<id>        (panel defaults to actions)
 *   surface invariant  → ?surface=<sid>&panel=invariants&focus=invariant:<id>
 *   action invariant   → ?surface=<sid>&focus=action:<actionId>  (edited inside the action card)
 *   feature invariant  → ?tab=invariants
 * A `focus` token is only sent where the editor renders the matching
 * `data-focus-target` anchor, so a link never pulses at nothing. Returns `null`
 * for project-level constraints (no feature) — link those with `unspaProjectHref`.
 */
export function unspaRuleHref(
	rule: { kind: 'rule' | 'invariant'; nodeId: string; origin: RuleOrigin },
	base = unspaDashboardBase()
): string | null {
	const path = unspaRulePath(rule);
	return path ? unspaDashboardHref(path, base) : null;
}

/** The same rule deep link as a bare path, for the EMBEDDED editor. */
export function unspaRulePath(rule: {
	kind: 'rule' | 'invariant';
	nodeId: string;
	origin: RuleOrigin;
}): string | null {
	const { origin } = rule;
	if (!origin.featureId) return null;
	const parts: string[] = [];
	// A feature invariant lives on its own top-level tab, not under a surface.
	if (origin.kind === 'feature') parts.push('tab=invariants');
	if (origin.surfaceId) parts.push(`surface=${encodeURIComponent(origin.surfaceId)}`);
	if (origin.kind === 'surface') parts.push(rule.kind === 'rule' ? 'panel=rules' : 'panel=invariants');
	const focus = deepLinkFocus(rule);
	if (focus) parts.push(`focus=${encodeURIComponent(focus)}`);
	const query = parts.length ? `?${parts.join('&')}` : '';
	return `${unspaFeaturePath(origin.featureId)}${query}`;
}

/** The `data-focus-target` the editor scrolls to for this row, if it renders one. */
function deepLinkFocus(rule: {
	kind: 'rule' | 'invariant';
	nodeId: string;
	origin: RuleOrigin;
}): string | null {
	const { origin } = rule;
	// Rules anchor on themselves; the editor resolves surface vs action from the id.
	if (rule.kind === 'rule') return rule.nodeId ? `rule:${rule.nodeId}` : null;
	// Surface invariants anchor on themselves; an action's post-conditions are
	// edited inside its card, so focus the action that owns them.
	if (origin.kind === 'surface') return rule.nodeId ? `invariant:${rule.nodeId}` : null;
	if (origin.kind === 'action') return origin.actionId ? `action:${origin.actionId}` : null;
	return null;
}
