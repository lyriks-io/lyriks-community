<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		themeStyleVars,
		markerStyleVars,
		terminalStyleVars,
		resolveDeviceSize,
		deviceChrome,
		appDomain,
		screenPath,
		type BuilderNode
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import NodeTree from './NodeTree.svelte';
	import NodeRenderer from './NodeRenderer.svelte';
	import SimFrame from './SimFrame.svelte';
	import FlexInspector from './FlexInspector.svelte';
	import ElementInspector from './ElementInspector.svelte';

	interface Role {
		id: string;
		name: string;
	}
	interface Props {
		store: ExperienceStore;
		screenId: string;
		roles?: Role[];
		onRun?: () => void;
		/** Non-'screen' kinds edit a REUSABLE surface (template / component) — its
		 *  tree is referenced from screens, so screen-only controls are hidden. */
		surfaceKind?: 'screen' | 'template' | 'component';
	}
	let { store, screenId, roles = [], onRun, surfaceKind = 'screen' }: Props = $props();
	let expandedTreeNodeIds = $state<Set<string>>(new Set());
	let lastSelectionPathId = $state<string | null>(null);

	const isReusable = $derived(surfaceKind !== 'screen');
	const surfaceLabel = $derived(
		surfaceKind === 'template' ? 'Template layout' : surfaceKind === 'component' ? 'Component layout' : 'Layout designer'
	);

	// Ensure the surface has a root group (created once, lazily).
	$effect(() => {
		if (!store.draft.builder.screenRoots[screenId]) {
			if (surfaceKind === 'template') store.openBuilderTemplate(screenId);
			else if (surfaceKind === 'component') store.openBuilderComponent(screenId);
			else store.openBuilderScreen(screenId);
		}
	});

	const rootId = $derived(store.draft.builder.screenRoots[screenId] ?? null);
	const selectedNode = $derived<BuilderNode | null>(
		store.selectedBuilderNodeId
			? (store.draft.builder.nodes[store.selectedBuilderNodeId] ?? null)
			: null
	);
	const isEntry = $derived(store.draft.builder.entryScreenId === screenId);

	// Per-screen device layout — sizes the fake window + chooses its chrome.
	const curScreen = $derived(store.draft.screens.find((s) => s.id === screenId));
	const dev = $derived(
		resolveDeviceSize(
			curScreen?.device ?? 'auto',
			curScreen?.deviceW ?? 1024,
			curScreen?.deviceH ?? 768,
			store.draft.builder.theme,
			store.formFactors
		)
	);
	const chrome = $derived(deviceChrome(dev.kind));
	const surfaceStyle = $derived(
		chrome === 'terminal'
			? `${terminalStyleVars()};background:var(--sim-surface);border-color:var(--sim-border);color:var(--sim-ink);font-family:var(--sim-font);border-radius:var(--sim-radius-card)`
			: `background:var(--sim-surface);border-color:var(--sim-border);border-radius:var(--sim-radius-card);font-family:var(--sim-font);color:var(--sim-ink)`
	);
	const screenUrl = $derived(`${appDomain(store.productName)}${curScreen ? screenPath(curScreen) : '/'}`);

	function groupIdsUnder(nodeId: string | null): string[] {
		if (!nodeId) return [];
		const node = store.draft.builder.nodes[nodeId];
		if (!node || node.kind !== 'group') return [];
		return [nodeId, ...node.childIds.flatMap((id) => groupIdsUnder(id))];
	}

	function ancestorGroupIds(nodeId: string | null): string[] {
		const ids: string[] = [];
		let node = nodeId ? store.draft.builder.nodes[nodeId] : null;
		while (node?.parentId) {
			ids.push(node.parentId);
			node = store.draft.builder.nodes[node.parentId];
		}
		return ids;
	}

	function setNodeExpanded(nodeId: string, expanded: boolean) {
		const next = new Set(expandedTreeNodeIds);
		if (expanded) next.add(nodeId);
		else next.delete(nodeId);
		expandedTreeNodeIds = next;
	}

	function expandAllTreeNodes() {
		expandedTreeNodeIds = new Set(groupIdsUnder(rootId));
	}

	function collapseAllTreeNodes() {
		expandedTreeNodeIds = new Set();
		lastSelectionPathId = store.selectedBuilderNodeId;
	}

	$effect(() => {
		const root = rootId;
		const selected = store.selectedBuilderNodeId;
		if (!root) return;
		if (!selected) {
			if (expandedTreeNodeIds.size > 0) expandedTreeNodeIds = new Set();
			lastSelectionPathId = null;
			return;
		}
		if (selected === lastSelectionPathId) return;
		const selectedNode = store.draft.builder.nodes[selected];
		if (!selectedNode || selectedNode.surfaceId !== screenId) return;
		expandedTreeNodeIds = new Set(ancestorGroupIds(selected));
		lastSelectionPathId = selected;
	});
</script>

<div class="rounded-card border border-line bg-surface">
	<div class="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
		<span class="text-[10px] font-semibold uppercase tracking-widest text-ink-400"
			>{surfaceLabel}</span
		>
		<div class="flex items-center gap-1.5">
			{#if !isReusable}
				<button
					type="button"
					onclick={() => store.setBuilderEntryScreen(screenId)}
					class="flex items-center gap-1 rounded-field border px-2 py-1 text-[11px] font-semibold transition-colors {isEntry
						? 'border-brand-300 bg-brand-50 text-brand-600'
						: 'border-line text-ink-400 hover:text-ink-700'}"
					title="Run starts on this screen"
				>
					<Icon name="pin" size={12} />
					{isEntry ? 'Entry screen' : 'Set as entry'}
				</button>
			{/if}
			{#if onRun && !isReusable}
				<button
					type="button"
					onclick={onRun}
					class="flex items-center gap-1 rounded-field bg-brand-gradient px-2.5 py-1 text-[11px] font-semibold text-white shadow-card"
				>
					<Icon name="sparkles" size={12} /> Run
				</button>
			{/if}
		</div>
	</div>

	{#if rootId}
		<div class="grid gap-0 bg-surface-sunken lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_300px]">
			<!-- outline -->
			<div class="overflow-x-auto border-line bg-surface p-2 lg:border-r">
				<div class="mb-1 flex items-center justify-between gap-2 px-1">
					<p class="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Tree</p>
					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={expandAllTreeNodes}
							class="rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
						>
							Expand
						</button>
						<button
							type="button"
							onclick={collapseAllTreeNodes}
							class="rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
						>
							Retract
						</button>
					</div>
				</div>
				<NodeTree
					{store}
					nodeId={rootId}
					expandedIds={expandedTreeNodeIds}
					onToggleExpanded={setNodeExpanded}
				/>
			</div>

			<!-- canvas (themed backdrop so the device card pops) -->
			<div
				role="button"
				tabindex="-1"
				class="sim-scope p-6"
				style="{themeStyleVars(store.draft.builder.theme)};{markerStyleVars(
					store.draft.brand.markers
				)};background:var(--sim-bg)"
				onclick={() => store.selectBuilderNode(null)}
				onkeydown={(e) => {
					if (e.key === 'Escape') store.selectBuilderNode(null);
				}}
			>
				<SimFrame deviceKind={dev.kind} url={screenUrl} {surfaceStyle}>
					<NodeRenderer {store} nodeId={rootId} mode="design" />
				</SimFrame>
			</div>

			<!-- inspector -->
			<div class="border-line bg-surface p-3 lg:border-l">
				<p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Inspector</p>
				{#if selectedNode?.kind === 'group'}
					<FlexInspector {store} node={selectedNode} />
				{:else if selectedNode?.kind === 'element'}
					<ElementInspector {store} node={selectedNode} {roles} />
				{:else}
					<p class="text-[11px] text-ink-400">Select a node in the tree or canvas to edit it.</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
