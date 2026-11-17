<script lang="ts" module>
	import type { DockingGraph, LocalGraph } from '$domain/evolution';

	/** One docking read per drawing of the request, shared by the three steps that show it. */
	const dockings = new WeakMap<LocalGraph, Promise<DockingGraph | null>>();
	function dockingOf(graph: LocalGraph, projectId: string, requestId: string): Promise<DockingGraph | null> {
		let pending = dockings.get(graph);
		if (!pending) {
			pending = fetch(`/api/evolution?projectId=${encodeURIComponent(projectId)}&requestId=${encodeURIComponent(requestId)}&part=docking`)
				.then(async (res) => (res.ok ? ((await res.json()) as { docking: DockingGraph }).docking : null))
				.catch(() => null);
			dockings.set(graph, pending);
		}
		return pending;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { DiagramEnlarger, EnlargedBackdrop, DiagramHeader, Icon, PanZoom, PanZoomCanvas, frameClass, portalWhile } from '$ui/design-system';
	import { changesWithHolders, type LocalNode } from '$domain/evolution';
	import DockingNetwork from './DockingNetwork.svelte';
	import { LOOK, kindLabel } from './graph-look';
	import { sentenceLines, type SentenceRun } from './graph-sentence';

	/**
	 * The request drawn as its own graph (ac-evo-graph-local, -status, -folded,
	 * -per-step). Read-only: a node opens what it stands for, never edits it.
	 * Columns follow the model, from the core on the left to the rules, states
	 * and transitions on the right; it opens folded at the actions and a node
	 * with something folded under it unfolds on a click. Two views behind one
	 * switch (302d93bf): the changes alone, the default, then where they dock on
	 * the existing product (d2477e20).
	 */
	interface Props {
		graph: LocalGraph | null;
		loading: boolean;
		/** What the step is about: its features, their behaviour, or what the impact reaches. */
		focus: 'features' | 'behaviour' | 'reach';
		projectId: string;
		requestId: string;
	}
	let { graph, loading, focus, projectId, requestId }: Props = $props();

	/** The changes alone stay the default; the docking is read only once a reader asks for it. */
	let drawing = $state<'changes' | 'docking'>('changes');
	let docking = $state<DockingGraph | null>(null);
	let dockingLoading = $state(false);
	$effect(() => {
		if (drawing !== 'docking' || !graph) return;
		const asked = graph;
		dockingLoading = true;
		void dockingOf(asked, projectId, requestId).then((read) => {
			if (asked !== graph) return;
			docking = read;
			dockingLoading = false;
		});
	});

	const NODE_W = 176;
	const NODE_H = 30;
	const COL_W = 210;
	const GAP = 10;
	// A rule or an invariant reads whole, as its EARS sentence, in a box as tall as its lines (ac-evo-graph-ears).
	const SENTENCE_W = 340;
	const SENTENCE_CHARS = 52;
	const LINE_H = 14;

	/** What the drawing shown is about, in plain words (ac-diag-title). */
	const title = $derived(
		drawing === 'docking'
			? 'Where the request meets the existing product'
			: focus === 'reach'
				? 'What the request changes, and what its impact reaches'
				: 'What the request adds, changes or removes, and what holds it'
	);

	let expanded = $state<Record<string, boolean>>({});

	// One view per graph, shared by both drawings: zoom, pan and the enlarged dialog.
	const view = new PanZoom();
	const enlarger = new DiagramEnlarger();
	$effect(() => enlarger.attach());
	const CANVAS_HEIGHT = '420px';

	/** What the step is about, before any view is chosen. */
	const inFocus = $derived(
		(graph?.nodes ?? []).filter((n) =>
			focus === 'features' ? (n.kind === 'core' || n.kind === 'feature' || n.kind === 'table') && n.status !== 'reached' : focus === 'behaviour' ? n.status !== 'reached' : true
		)
	);
	/** The changes and only what holds them: what both views draw of the request itself. */
	const kept = $derived(changesWithHolders(inFocus));
	const byId = $derived(new Map(kept.map((n) => [n.id, n])));
	const childrenOf = $derived.by(() => {
		const map = new Map<string | null, LocalNode[]>();
		for (const n of kept) {
			const parent = n.parentId && byId.has(n.parentId) ? n.parentId : null;
			map.set(parent, [...(map.get(parent) ?? []), n]);
		}
		return map;
	});
	const foldedUnder = (id: string) => (childrenOf.get(id) ?? []).filter((c) => c.folded).length;
	/** What the request adds, changes or removes is never folded away: a node holding some opens on it. */
	const opensOnChange = (id: string) => (childrenOf.get(id) ?? []).some((c) => c.folded && c.status !== 'existing');
	const isExpanded = (id: string) => expanded[id] ?? opensOnChange(id);

	/**
	 * Rows in reading order: each node under its parent, folded ones only once
	 * their parent is unfolded, a parent centred on what it holds. A rule or an
	 * invariant takes as many lines as its sentence needs.
	 */
	const layout = $derived.by(() => {
		const placed: { node: LocalNode; x: number; y: number; w: number; h: number; lines: SentenceRun[][] | null }[] = [];
		const edges: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
		let next = 0;
		const visit = (node: LocalNode, depth: number): { top: number; bottom: number; middle: number } => {
			const lines = node.statement ? sentenceLines(node.statement, SENTENCE_CHARS) : null;
			const w = lines ? SENTENCE_W : NODE_W;
			const h = lines ? 20 + lines.length * LINE_H : NODE_H;
			const kids = (childrenOf.get(node.id) ?? []).filter((c) => !c.folded || isExpanded(node.id));
			const spans = kids.map((child) => visit(child, depth + 1));
			let y: number;
			if (spans.length > 0) y = (spans[0].top + spans[spans.length - 1].bottom) / 2 - h / 2;
			else {
				y = next;
				next += h + GAP;
			}
			const x = depth * COL_W;
			placed.push({ node, x, y, w, h, lines });
			for (const span of spans) edges.push({ from: { x: x + w, y: y + h / 2 }, to: { x: (depth + 1) * COL_W, y: span.middle } });
			return { top: y, bottom: y + h, middle: y + h / 2 };
		};
		for (const root of childrenOf.get(null) ?? []) visit(root, 0);
		const width = Math.max(...placed.map((p) => p.x + p.w), NODE_W) + 8;
		const height = Math.max(next - GAP, NODE_H);
		return { placed, edges, width, height };
	});
	// Tell the view the drawing's size; untracked, since fitting writes the view's own state.
	$effect(() => {
		const { width, height } = layout;
		if (drawing === 'changes') untrack(() => view.setNatural(width, height));
	});
	const statuses = $derived([...new Set(kept.map((n) => n.status))]);
	const short = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);
	const toggle = (node: LocalNode) => {
		if (foldedUnder(node.id) > 0) expanded = { ...expanded, [node.id]: !isExpanded(node.id) };
	};
	const featureHref = (node: LocalNode) => (node.featureId ? `/projects/${projectId}/features?leaf=${encodeURIComponent(node.featureId)}` : null);
</script>

<EnlargedBackdrop {enlarger} />
<figure
	use:portalWhile={enlarger.enlarged}
	class="space-y-2 rounded-card border border-line bg-surface p-3 {enlarger.enlarged ? frameClass(enlarger.display) : 'relative'}"
	role={enlarger.enlarged ? 'dialog' : undefined}
	aria-modal={enlarger.enlarged ? 'true' : undefined}
	aria-label={title}
>
	<DiagramHeader {enlarger} {title} />
	{#snippet switcher()}
		{#each [{ code: 'changes', label: 'Changes', hint: 'Only what the request adds, changes or removes, with what holds it' }, { code: 'docking', label: 'Docking', hint: 'Where those changes meet the existing product' }] as mode (mode.code)}
			<button
				type="button"
				onclick={() => {
					drawing = mode.code as 'changes' | 'docking';
					view.refit();
				}}
				aria-pressed={drawing === mode.code}
				title={mode.hint}
				class="rounded-pill border px-2 py-0.5 font-medium transition {drawing === mode.code
					? 'border-brand-300 bg-brand-50 text-brand-600'
					: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-700'}"
			>
				{mode.label}
			</button>
		{/each}
	{/snippet}
	{#if loading && !graph}
		<p class="text-xs text-ink-500">Drawing the request…</p>
	{:else if inFocus.length === 0}
		<p class="text-xs text-ink-500">Nothing to draw yet: name what the change touches.</p>
	{:else if kept.length === 0}
		<p class="text-xs text-ink-500">The request changes nothing here yet: draft what it adds, changes or removes.</p>
	{:else if drawing === 'docking'}
		{#if docking}
			<DockingNetwork {docking} keep={new Set(kept.map((n) => n.id))} {projectId} {view} {enlarger} height={CANVAS_HEIGHT} before={switcher} />
		{:else}
			<div class="flex items-center justify-between gap-2">
				<p class="text-xs text-ink-500">{dockingLoading ? 'Docking the request on the product…' : 'The product could not be read to dock the request on it.'}</p>
				<div class="flex items-center gap-1 text-[0.6875rem]">{@render switcher()}</div>
			</div>
		{/if}
	{:else}
		<PanZoomCanvas {view} {enlarger} height={CANVAS_HEIGHT} label="Changes of the request" before={switcher}>
			<svg width={layout.width} height={layout.height} role="img" aria-label="Graph of the request" class="block">
				{#each layout.edges as edge, index (index)}
					<path
						d="M{edge.from.x},{edge.from.y} C{edge.from.x + 20},{edge.from.y} {edge.to.x - 20},{edge.to.y} {edge.to.x},{edge.to.y}"
						class="fill-none stroke-line-strong"
						stroke-width="1"
					/>
				{/each}
				{#each layout.placed as { node, x, y, w, h, lines } (node.id)}
					{@const look = LOOK[node.status]}
					{@const hidden = foldedUnder(node.id)}
					{@const href = node.kind === 'feature' ? featureHref(node) : null}
					<g transform="translate({x},{y})">
						<title>{kindLabel(node)}: {node.label}. {look.word}.</title>
						<rect width={w} height={h} rx={node.kind === 'feature' || node.kind === 'core' ? 8 : 4} class={look.box} stroke-width="1.25" stroke-dasharray={look.dashed ? '4 3' : undefined} />
						<text x="8" y="12" class="fill-ink-400 text-[0.5625rem] uppercase tracking-wide">{kindLabel(node)}</text>
						{#if lines}
							<!-- The sentence the model gives the rule, whole, its EARS keywords set apart (ac-evo-graph-ears). -->
							<text y="26" class="{look.text} text-[0.6875rem]">{#each lines as line, index (index)}<tspan x="8" dy={index === 0 ? 0 : LINE_H}>{#each line as run, at (at)}{#if run.keyword}<tspan font-weight="700">{run.text}</tspan>{:else}{run.text}{/if}{/each}</tspan>{/each}</text>
						{:else if href}
							<a {href} onclick={(e) => e.stopPropagation()}>
								<text x="8" y="24" class="{look.text} text-[0.6875rem] font-medium underline-offset-2 hover:underline">{short(node.label)}</text>
							</a>
						{:else}
							<text x="8" y="24" class="{look.text} text-[0.6875rem] font-medium">{short(node.label)}</text>
						{/if}
						{#if hidden > 0}
							<g
								class="cursor-pointer"
								role="button"
								tabindex="0"
								aria-label="{isExpanded(node.id) ? 'Fold' : 'Unfold'} what {node.label} holds"
								aria-expanded={isExpanded(node.id)}
								onclick={() => toggle(node)}
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(node)}
							>
								<rect x={NODE_W - 30} y="5" width="24" height="20" rx="4" class="fill-brand-50 stroke-brand-200" />
								<text x={NODE_W - 18} y="19" text-anchor="middle" class="fill-brand-700 text-[0.625rem] font-semibold">{isExpanded(node.id) ? '−' : `+${hidden}`}</text>
							</g>
						{/if}
					</g>
				{/each}
			</svg>
		</PanZoomCanvas>
	{/if}
	{#if kept.length > 0 && !(loading && !graph)}
		<figcaption class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-500">
			{#each statuses as status (status)}
				<span class="flex items-center gap-1">
					<svg width="14" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="13" height="9" rx="2" class={LOOK[status].box} stroke-dasharray={LOOK[status].dashed ? '3 2' : undefined} /></svg>
					{LOOK[status].word}
				</span>
			{/each}
			{#if drawing === 'docking'}
				<span class="flex items-center gap-1">
					<svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" class="fill-surface-sunken stroke-ink-300" /></svg>
					Existing, docked on by the request
				</span>
			{:else if kept.some((n) => n.folded)}
				<span class="flex items-center gap-1 text-brand-700"><Icon name="plus" size={11} />on a box unfolds its rules, states, transitions and events</span>
			{/if}
		</figcaption>
	{/if}
</figure>

