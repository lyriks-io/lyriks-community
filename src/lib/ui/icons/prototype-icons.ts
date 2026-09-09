/**
 * Curated lucide icons available to PROTOTYPE screens (`el:"icon"` in the
 * Experience builder). Prototype icon names are data (authored per project), so
 * the `pnpm icons:build` source scan can't discover them — this file lists them
 * as literal `lucide:<name>` strings precisely so the scanner bundles them into
 * the offline subset. Keep the catalog broad but finite: every name here ships
 * in `lucide-offline.json`, and anything NOT here renders as a fallback dot.
 *
 * After editing this list, run `pnpm icons:build`.
 */
const PROTOTYPE_ICONS = [
	// Navigation & structure
	'lucide:home', 'lucide:menu', 'lucide:search', 'lucide:settings', 'lucide:layout-dashboard',
	'lucide:layout-grid', 'lucide:list', 'lucide:folder', 'lucide:folder-open', 'lucide:inbox',
	'lucide:arrow-left', 'lucide:arrow-right', 'lucide:arrow-up-right', 'lucide:external-link',
	'lucide:chevron-right', 'lucide:chevron-down', 'lucide:chevrons-up-down', 'lucide:x',
	'lucide:plus', 'lucide:minus', 'lucide:more-horizontal', 'lucide:more-vertical',
	// People & communication
	'lucide:user', 'lucide:users', 'lucide:user-plus', 'lucide:message-square', 'lucide:message-circle',
	'lucide:mail', 'lucide:send', 'lucide:phone', 'lucide:bell', 'lucide:at-sign',
	// Status & feedback
	'lucide:check', 'lucide:check-circle-2', 'lucide:circle', 'lucide:alert-triangle',
	'lucide:alert-circle', 'lucide:info', 'lucide:help-circle', 'lucide:shield', 'lucide:shield-check',
	'lucide:lock', 'lucide:unlock', 'lucide:eye', 'lucide:eye-off', 'lucide:loader',
	// Actions & editing
	'lucide:pencil', 'lucide:trash-2', 'lucide:copy', 'lucide:download', 'lucide:upload',
	'lucide:share-2', 'lucide:filter', 'lucide:refresh-cw', 'lucide:save', 'lucide:log-out',
	'lucide:log-in', 'lucide:link', 'lucide:paperclip', 'lucide:archive',
	// Commerce & business
	'lucide:shopping-cart', 'lucide:credit-card', 'lucide:wallet', 'lucide:dollar-sign',
	'lucide:tag', 'lucide:gift', 'lucide:package', 'lucide:truck', 'lucide:store',
	'lucide:briefcase', 'lucide:building-2', 'lucide:landmark', 'lucide:receipt',
	// Data & analytics
	'lucide:bar-chart-3', 'lucide:line-chart', 'lucide:pie-chart', 'lucide:trending-up',
	'lucide:trending-down', 'lucide:activity', 'lucide:database', 'lucide:server', 'lucide:cloud',
	'lucide:table', 'lucide:file-text', 'lucide:file', 'lucide:clipboard-list', 'lucide:book-open',
	// Time & scheduling
	'lucide:calendar', 'lucide:clock', 'lucide:timer', 'lucide:history', 'lucide:hourglass',
	// Media & content
	'lucide:image', 'lucide:camera', 'lucide:video', 'lucide:music', 'lucide:play',
	'lucide:pause', 'lucide:mic', 'lucide:headphones', 'lucide:film', 'lucide:radio',
	// Product & misc
	'lucide:zap', 'lucide:star', 'lucide:heart', 'lucide:bookmark', 'lucide:flag',
	'lucide:map-pin', 'lucide:map', 'lucide:globe', 'lucide:compass', 'lucide:rocket',
	'lucide:sparkles', 'lucide:flame', 'lucide:leaf', 'lucide:mountain', 'lucide:coffee',
	'lucide:sun', 'lucide:moon', 'lucide:palette', 'lucide:wrench', 'lucide:cpu',
	'lucide:smartphone', 'lucide:monitor', 'lucide:wifi', 'lucide:key', 'lucide:puzzle',
	'lucide:layers', 'lucide:box', 'lucide:target', 'lucide:award', 'lucide:thumbs-up'
] as const;

/** Bare names (no `lucide:` prefix) — what `el:"icon"` labels accept. */
export const PROTOTYPE_ICON_NAMES: readonly string[] = PROTOTYPE_ICONS.map((i) =>
	i.slice('lucide:'.length)
);

export function isPrototypeIcon(name: string): boolean {
	return PROTOTYPE_ICON_NAMES.includes(name.trim());
}
