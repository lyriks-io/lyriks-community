import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum
} from 'd3-force';
import type { GraphEdgeKind, GraphNodeKind } from '$domain/graph';

export interface ForceNode extends SimulationNodeDatum {
	readonly id: string;
	readonly kind: GraphNodeKind;
	readonly radius: number;
}

export interface ForceLink extends SimulationLinkDatum<ForceNode> {
	readonly id: string;
	readonly kind: GraphEdgeKind;
}

const isSemantic = (kind: GraphEdgeKind): boolean =>
	kind === 'binds' ||
	kind === 'reads' ||
	kind === 'writes' ||
	kind === 'tests' ||
	kind === 'triggers' ||
	kind === 'transitions' ||
	kind === 'emits';

const isRootSpoke = (link: ForceLink): boolean => {
	if (link.kind !== 'contains') return false;
	const source = link.source as ForceNode;
	const target = link.target as ForceNode;
	return source.kind === 'project' || target.kind === 'project';
};

/**
 * Canvas-friendly force layout. D3's Barnes–Hut many-body force replaces the
 * former O(n²) all-pairs repulsion, and alpha decay stops the timer once the
 * graph settles. Call `alpha(...).restart()` only after an interaction.
 */
export function createForceLayout(
	nodes: ForceNode[],
	links: ForceLink[],
	onTick: () => void,
	onEnd?: () => void
): Simulation<ForceNode, ForceLink> {
	const link = forceLink<ForceNode, ForceLink>(links)
		.id((node) => node.id)
		.distance((edge) => (isRootSpoke(edge) ? 245 : isSemantic(edge.kind) ? 82 : edge.kind === 'contains' ? 112 : 145))
		.strength((edge) => (isRootSpoke(edge) ? 0.035 : isSemantic(edge.kind) ? 0.72 : edge.kind === 'contains' ? 0.24 : 0.42));

	return forceSimulation<ForceNode>(nodes)
		.force('link', link)
		.force(
			'charge',
			forceManyBody<ForceNode>()
				.strength((node) => -70 - node.radius * 5)
				.distanceMin(12)
				.distanceMax(720)
				.theta(0.9)
		)
		.force('collision', forceCollide<ForceNode>().radius((node) => node.radius + 9).strength(0.8).iterations(1))
		.force('center', forceCenter(0, 0).strength(0.05))
		.force('x', forceX<ForceNode>(0).strength(0.012))
		.force('y', forceY<ForceNode>(0).strength(0.012))
		.alphaDecay(0.035)
		.alphaMin(0.002)
		.velocityDecay(0.38)
		.on('tick', onTick)
		.on('end', () => onEnd?.());
}
