<script lang="ts">
	import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
	import type { DockedNode, DockingGraph } from '$domain/evolution';
	import { nodeSourceHref } from '$domain/graph/node-link';
	import { edgePresentation } from '$ui/graph/edge-presentation';
	import { PanZoomCanvas, type DiagramEnlarger, type PanZoom } from '$ui/design-system';
	import { untrack, type Snippet } from 'svelte';
	import { LOOK, kindLabel } from './graph-look';

	/**
	 * The request as a network docked on the product (ac-evo-graph-network,
	 * ac-evo-graph-docking). Its own nodes keep the colour law; the existing
	 * elements it touches are drawn grey and smaller around it. Read-only: a
	 * node opens where it lives (ac-evo-graph-4).
	 */
	interface Props {
		docking: DockingGraph;
		/** The request nodes the step keeps: the network honours the step's focus. */
		keep: ReadonlySet<string>;
		projectId: string;
		/** The graph's view and dialog, shared with the changes drawing. */
		view: PanZoom;
		enlarger: DiagramEnlarger;
		height: string;
		/** What the navigation panel shows before its own buttons: the view switch. */
		before?: Snippet;
	}
	let { docking, keep, projectId, view, enlarger, height, before }: Props = $props();

	type Placed = SimulationNodeDatum & { node: DockedNode; r: number };

	/** The kept request nodes, and only the existing elements that touch one of them. */
	const shown = $derived.by(() => {
		const own = new Set(docking.nodes.filter((n) => n.local && keep.has(n.local.id)).map((n) => n.id));
		const touching = new Set<string>();
		for (const e of docking.edges) {
			if (own.has(e.from)) touching.add(e.to);
			if (own.has(e.to)) touching.add(e.from);
		}
		const nodes = docking.nodes.filter((n) => own.has(n.id) || (!n.local && touching.has(n.id)));
		const ids = new Set(nodes.map((n) => n.id));
		const edges = docking.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
		return { nodes, edges, docks: edges.filter((e) => own.has(e.from) !== own.has(e.to)).length };
	});

	/** Laid out once per drawing, synchronously: a few hundred nodes settle in a few milliseconds. */
	const layout = $derived.by(() => {
		const placed: Placed[] = shown.nodes.map((node, i) => ({
			node,
			r: node.local ? (node.local.kind === 'core' || node.local.kind === 'feature' ? 11 : 7) : 4.5,
			x: Math.cos(i * 2.4) * 12 * Math.sqrt(i + 1),
			y: Math.sin(i * 2.4) * 12 * Math.sqrt(i + 1)
		}));
		const links = shown.edges.map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
		const sim = forceSimulation<Placed>(placed)
			.force('link', forceLink<Placed, (typeof links)[number]>(links).id((p) => p.node.id).distance((l) => (l.kind === 'contains' ? 46 : 70)).strength(0.6))
			.force('charge', forceManyBody<Placed>().strength((p) => (p.node.local ? -170 : -60)))
			.force('collide', forceCollide<Placed>().radius((p) => p.r + 6))
			.force('x', forceX<Placed>(0).strength(0.04))
			.force('y', forceY<Placed>(0).strength(0.04))
			.stop();
		for (let i = 0; i < 260; i++) sim.tick();
		const at = new Map(placed.map((p) => [p.node.id, p]));
		const xs = placed.map((p) => p.x ?? 0);
		const ys = placed.map((p) => p.y ?? 0);
		const pad = 60;
		const minX = Math.min(...xs) - pad;
		const minY = Math.min(...ys) - pad / 2;
		const width = Math.max(...xs) - minX + pad;
		const height = Math.max(...ys) - minY + pad / 2;
		return { placed, at, viewBox: `${minX} ${minY} ${width} ${height}`, width, height };
	});

	// Tell the view the drawing's size; untracked, since fitting writes the view's own state.
	$effect(() => {
		const { width, height } = layout;
		untrack(() => view.setNatural(width, height));
	});

	let hoverId = $state<string | null>(null);
	const near = $derived.by(() => {
		if (!hoverId) return null;
		const ids = new Set([hoverId]);
		for (const e of shown.edges) {
			if (e.from === hoverId) ids.add(e.to);
			if (e.to === hoverId) ids.add(e.from);
		}
		return ids;
	});
	const dim = (id: string) => near !== null && !near.has(id);
	/** The nodes that hold the others are always named; the rest are named on hover, as in the knowledge graph. */
	const MAJOR = new Set(['core', 'feature', 'surface', 'action', 'table', 'entity', 'screen', 'role', 'journey']);
	const named = (node: DockedNode) => (near ? near.has(node.id) : MAJOR.has(node.local?.kind ?? node.source?.kind ?? ''));

	const short = (label: string, max: number) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);
	const hrefOf = (node: DockedNode): string | null =>
		node.source ? nodeSourceHref(projectId, node.source) : node.local?.featureId ? `/projects/${projectId}/features?leaf=${encodeURIComponent(node.local.featureId)}` : null;
	const kindOf = (node: DockedNode) => (node.local ? kindLabel(node.local) : (node.source?.kind ?? ''));
</script>

<PanZoomCanvas {view} {enlarger} {height} label="The request docked on the product" {before}>
	<svg
		viewBox={layout.viewBox}
		width={layout.width}
		height={layout.height}
		class="block"
		role="img"
		aria-label="The request docked on the product"
	>
		{#each shown.edges as edge, index (index)}
			{@const from = layout.at.get(edge.from)}
			{@const to = layout.at.get(edge.to)}
			{#if from && to}
				<line
					x1={from.x}
					y1={from.y}
					x2={to.x}
					y2={to.y}
					stroke={edgePresentation(edge.kind).color}
					stroke-width={edge.kind === 'contains' ? 0.8 : 1.2}
					stroke-dasharray={edgePresentation(edge.kind).dash || undefined}
					opacity={near && !(near.has(edge.from) && near.has(edge.to)) ? 0.12 : 0.7}
				><title>{edgePresentation(edge.kind).label}</title></line>
			{/if}
		{/each}
		{#each layout.placed as p (p.node.id)}
			{@const node = p.node}
			{@const look = node.local ? LOOK[node.local.status] : null}
			{@const href = hrefOf(node)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g
				transform="translate({p.x},{p.y})"
				opacity={dim(node.id) ? 0.25 : 1}
				onmouseenter={() => (hoverId = node.id)}
				onmouseleave={() => (hoverId = null)}
			>
				<!-- A rule or an invariant gives its EARS sentence whole on hover (ac-evo-graph-ears). -->
				<title>{kindOf(node)}: {node.local?.statement ? `${node.local.statement} (${node.label})` : node.label}. {look ? look.word : 'Existing, docked on by the request'}.</title>
				{#snippet mark()}
					<circle
						r={p.r}
						class={look ? look.box : 'fill-surface-sunken stroke-ink-300'}
						stroke-width={look ? 1.5 : 1}
						stroke-dasharray={look?.dashed ? '3 2' : undefined}
					/>
					{#if named(node)}<text
						y={p.r + 10}
						text-anchor="middle"
						class="{look ? `${look.text} text-[0.625rem] font-medium` : 'fill-ink-400 text-[0.5rem]'} pointer-events-none"
					>{short(node.label, look ? 22 : 18)}</text>{/if}
				{/snippet}
				{#if href}
					<a {href}>{@render mark()}</a>
				{:else}
					{@render mark()}
				{/if}
			</g>
		{/each}
	</svg>
</PanZoomCanvas>
<p class="text-[0.6875rem] text-ink-500">
	{shown.docks} docking {shown.docks === 1 ? 'point' : 'points'} on {shown.nodes.filter((n) => !n.local).length} existing
	{shown.nodes.filter((n) => !n.local).length === 1 ? 'element' : 'elements'}{#if docking.omitted > 0}, {docking.omitted} more left out{/if}.
</p>
