/**
 * Which surfaces render on a screen: the screen itself plus, transitively, every
 * reusable component it hosts (a group with `componentId` pulls that component's
 * subtree in). Nodes inside those subtrees carry the COMPONENT's surfaceId, not
 * the host screen's — so any analysis that walks "the elements of a screen"
 * (navigation graphs, journey happy-paths, label lookups) must widen through
 * this resolver or it silently misses behavior contributed by embedded
 * components (e.g. a sidebar's nav links).
 *
 * Pure — operates on the builder node map only.
 */
import type { BuilderNode } from './builder';

/**
 * Build a memoized resolver: surfaceId → the set of surface ids whose nodes
 * effectively render there (itself + hosted components, transitively, cycle-safe).
 */
export function hostedSurfacesResolver(
	nodes: Record<string, BuilderNode>
): (surfaceId: string) => ReadonlySet<string> {
	// surfaceId → componentIds it references: a group hosting a component subtree,
	// OR a `list` element whose `componentId` is its row template. Both render that
	// component's tree on the screen, so navigation authored inside a reused row
	// template (e.g. an "Open" link on each card) counts as an edge from the screen
	// — without this a bound-list row template was invisible to reachability.
	const refs = new Map<string, Set<string>>();
	for (const n of Object.values(nodes)) {
		if (!n.componentId) continue;
		const set = refs.get(n.surfaceId) ?? new Set<string>();
		set.add(n.componentId);
		refs.set(n.surfaceId, set);
	}

	const walk = (surfaceId: string, seen: Set<string>): void => {
		for (const compId of refs.get(surfaceId) ?? []) {
			if (seen.has(compId)) continue;
			seen.add(compId);
			walk(compId, seen);
		}
	};

	const memo = new Map<string, ReadonlySet<string>>();
	return (surfaceId) => {
		const cached = memo.get(surfaceId);
		if (cached) return cached;
		const seen = new Set<string>([surfaceId]);
		walk(surfaceId, seen);
		memo.set(surfaceId, seen);
		return seen;
	};
}
