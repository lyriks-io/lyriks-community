import type { GraphContext, GraphNode } from './graph';

/**
 * Deep-link a graph node back to the exact editor that owns it — the single
 * source of truth for both the graph explorer and project search. Pure and
 * framework-free.
 *
 * A link is `route?tab=…&node=<rawId>`: the page segment, the tab that shows
 * the object (pages persist their last tab, so a link WITHOUT `tab` can land a
 * feature on the Rules panel), and the anchor key `anchorKeyFromUrl`/
 * `use:focusField` recognise to scroll + flash the object. Two editors take
 * richer params: screens/elements open the Experience builder on the owning
 * surface (`?tab=screens&screen=…&node=…`), and the Rules panel (a Features
 * tab) takes its sub-tab as `rtab`.
 */
const CONTEXT_LABEL: Partial<Record<GraphContext, string>> = {
	project: 'Foundation',
	foundation: 'Foundation',
	users: 'Users & Permissions',
	features: 'Features',
	experience: 'Experience',
	data: 'Infrastructure & Data',
	rules: 'Rules & edge cases',
	architecture: 'Infrastructure & Data',
	coherence: 'Project health',
	behavior: 'Features · Behavior',
	engine: 'Engine'
};

/**
 * The underlying draft object id — the node id minus `kind:`, and minus the
 * `beh:` namespace kernel-only nodes carry, so the anchor key matches what the
 * editor renders (`data-anchor="<draftId>"`).
 */
export function rawNodeId(node: GraphNode): string {
	const raw = node.id.slice(node.id.indexOf(':') + 1);
	return raw.startsWith('beh:') ? raw.slice('beh:'.length) : raw;
}

function href(projectId: string, seg: string, params: Record<string, string>): string {
	const qs = new URLSearchParams(params).toString();
	return `/projects/${projectId}/${seg}${qs ? `?${qs}` : ''}`;
}

/** Route to the editor that owns this node, or null when no editor does. */
export function nodeSourceHref(projectId: string, node: GraphNode): string | null {
	const raw = rawNodeId(node);
	switch (node.context) {
		case 'project':
		case 'foundation':
			return href(projectId, 'foundation', node.kind === 'project' ? {} : { node: raw });
		case 'users':
			return href(projectId, 'users', {
				tab: node.kind === 'capability' ? 'permissions' : 'personas',
				node: raw
			});
		case 'features':
			if (node.kind === 'release') return href(projectId, 'features', { tab: 'roadmap', node: raw });
			// `feature=` opens the leaf's detail drawer (the real editor) when the id
			// is a tree leaf; cores/families fall back to the anchored tree row.
			return href(
				projectId,
				'features',
				node.kind === 'feature'
					? { tab: 'tree', feature: raw, node: raw }
					: { tab: 'tree', node: raw }
			);
		case 'rules': {
			// Issues have no board of their own — they surface as incoherences on the
			// Project health page (and the Control Center's coherence panel).
			if (node.kind === 'issue') return href(projectId, 'coherence', {});
			const rtab = node.kind === 'scenario' ? 'edge_cases' : 'inventory';
			return href(projectId, 'features', { tab: 'rules', rtab, node: raw });
		}
		case 'experience': {
			if (node.kind === 'screen') return href(projectId, 'experience', { tab: 'screens', screen: raw });
			if (node.kind === 'element') {
				// Builder elements open the builder on their owning surface; library
				// elements (no screenId) live in the Components view's element list.
				const screenId = typeof node.meta?.screenId === 'string' ? node.meta.screenId : '';
				return href(
					projectId,
					'experience',
					screenId
						? { tab: 'screens', screen: screenId, node: raw }
						: { tab: 'components', node: raw }
				);
			}
			if (node.kind === 'component')
				return href(projectId, 'experience', { tab: 'components', node: raw });
			// Templates are reusable layouts: they live in the Components view.
			if (node.kind === 'template')
				return href(projectId, 'experience', { tab: 'components', node: raw });
			// journeys, steps
			return href(projectId, 'experience', { tab: 'journeys', node: raw });
		}
		case 'data':
		case 'architecture':
			return href(projectId, 'infrastructure', { node: raw });
		case 'coherence':
			return href(projectId, 'coherence', node.kind === 'gap' ? {} : { node: raw });
		case 'behavior': {
			// Kernel-only depth (states, events, engine surfaces/rules/scenarios) is
			// inspected on the Features Behavior tab and authored via the behavior
			// editor / MCP. Composite kernel ids (`<featureId>:<localId>`) anchor
			// their owning feature's card.
			const anchor = raw.includes(':') ? raw.slice(0, raw.indexOf(':')) : raw;
			return href(projectId, 'features', { tab: 'behavior', node: anchor });
		}
		default:
			// 'engine' nodes are the formal substrate — no wizard editor owns them.
			return null;
	}
}

export function nodeContextLabel(context: GraphContext): string {
	return CONTEXT_LABEL[context] ?? context;
}
