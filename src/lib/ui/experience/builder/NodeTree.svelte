<script lang="ts">
	import { Icon, confirmDialog } from '$ui/design-system';
	import {
		childNodes,
		group,
		nodeDeletionImpact,
		BUILDER_ELEMENT_KINDS,
		type BuilderElementKind,
		type BuilderNode
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import Self from './NodeTree.svelte';

	interface Props {
		store: ExperienceStore;
		nodeId: string;
		depth?: number;
		expandedIds?: Set<string>;
		onToggleExpanded?: (nodeId: string, expanded: boolean) => void;
	}
	let {
		store,
		nodeId,
		depth = 0,
		expandedIds = new Set<string>(),
		onToggleExpanded = () => {}
	}: Props = $props();

	const node = $derived<BuilderNode | undefined>(store.draft.builder.nodes[nodeId]);

	// Deleting a node that other things read is a decision, not a click: name
	// what breaks first. Readers on OTHER screens are the ones nobody would notice
	// until the run breaks, so those require retyping the label to confirm.
	const surfaceName = (id: string) =>
		store.draft.screens.find((s) => s.id === id)?.name ||
		store.draft.components.find((c) => c.id === id)?.name ||
		'Untitled screen';
	async function deleteNode() {
		const impact = nodeDeletionImpact(store.draft.builder, nodeId);
		if (impact.dependants.length === 0) {
			store.removeBuilderNode(nodeId);
			return;
		}
		const label = node?.label || (node?.kind === 'element' ? node.elementKind : 'this group');
		const named = impact.dependants
			.slice(0, 5)
			.map((d) => (d.nodeId ? `"${d.label}" on ${surfaceName(d.surfaceId)} (${d.kind}: ${d.path})` : `a state seed (${d.path})`))
			.join(', ');
		const more = impact.dependants.length > 5 ? ` and ${impact.dependants.length - 5} more` : '';
		const off = impact.offSurfaceDependants.length;
		const ok = await confirmDialog({
			title: `Delete "${label}"?`,
			message:
				`You are breaking a connection to ${impact.dependants.length} thing${impact.dependants.length === 1 ? '' : 's'}: ${named}${more}.` +
				(off ? ` ${off} of them live on other screens and will stop working silently.` : ''),
			confirmLabel: 'Delete anyway',
			danger: true,
			requireText: off ? label : ''
		});
		if (!ok) return;
		store.removeBuilderNode(nodeId);
		store.notifier.notify(
			'warn',
			`Removed "${label}". ${impact.dependants.length} reference${impact.dependants.length === 1 ? '' : 's'} now point at nothing.`
		);
	}
	const selected = $derived(store.selectedBuilderNodeId === nodeId);
	const isRoot = $derived(node?.parentId == null);
	const isExpanded = $derived(expandedIds.has(nodeId));

	// index of this node within its parent (for reorder)
	const siblingIndex = $derived.by(() => {
		if (!node?.parentId) return -1;
		const g = group(store.draft.builder, node.parentId);
		return g ? g.childIds.indexOf(nodeId) : -1;
	});
	const siblingCount = $derived.by(() => {
		if (!node?.parentId) return 0;
		const g = group(store.draft.builder, node.parentId);
		return g ? g.childIds.length : 0;
	});

	let addingEl = $state(false);
	function addElement(kind: BuilderElementKind) {
		store.addBuilderElement(nodeId, kind);
		addingEl = false;
	}
</script>

{#if node}
	<div style="padding-left:{depth * 12}px">
		<div
			class="group flex items-center gap-1 rounded px-1 py-0.5 {selected
				? 'bg-brand-50'
				: 'hover:bg-surface-sunken'}"
		>
			{#if node.kind === 'group'}
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						onToggleExpanded(nodeId, !isExpanded);
					}}
					class="grid size-4 shrink-0 place-items-center rounded text-ink-300 hover:bg-surface-sunken hover:text-ink-700"
					title={isExpanded ? 'Retract node' : 'Expand node'}
					aria-label={isExpanded ? 'Retract node' : 'Expand node'}
				>
					<Icon name="chevron-down" size={12} class={isExpanded ? '' : '-rotate-90'} />
				</button>
			{:else}
				<span class="size-4 shrink-0"></span>
			{/if}
			<button
				type="button"
				onclick={() => store.selectBuilderNode(nodeId)}
				class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
			>
				<Icon
					name={node.kind === 'group' ? 'layers' : 'tag'}
					size={12}
					class={node.kind === 'group' ? 'text-brand-500' : 'text-ink-400'}
				/>
				<span class="truncate text-xs {selected ? 'font-semibold text-ink-900' : 'text-ink-600'}">
					{node.label || (node.kind === 'group' ? 'Group' : 'Element')}
				</span>
				{#if node.kind === 'element'}
					<span class="rounded bg-surface-sunken px-1 text-[9px] uppercase tracking-wider text-ink-400">
						{node.elementKind}
					</span>
				{/if}
			</button>
			<!-- reorder / delete (not for root) — revealed on row hover so labels
			     get the full width at rest -->
			{#if !isRoot}
				<div
					class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
				>
					<button
						type="button"
						onclick={() => store.reorderBuilderChild(node.parentId!, siblingIndex, siblingIndex - 1)}
						disabled={siblingIndex <= 0}
						class="text-ink-300 hover:text-ink-700 disabled:opacity-20"
						title="Move up"><Icon name="chevron-down" size={12} class="rotate-180" /></button
					>
					<button
						type="button"
						onclick={() => store.reorderBuilderChild(node.parentId!, siblingIndex, siblingIndex + 1)}
						disabled={siblingIndex >= siblingCount - 1}
						class="text-ink-300 hover:text-ink-700 disabled:opacity-20"
						title="Move down"><Icon name="chevron-down" size={12} /></button
					>
					<button
						type="button"
						onclick={() => store.duplicateBuilderNode(nodeId)}
						class="px-0.5 text-[10px] font-bold text-ink-300 hover:text-brand-600"
						title="Duplicate node">×2</button
					>
					<button
						type="button"
						onclick={deleteNode}
						class="text-ink-300 hover:text-danger-500"
						title="Delete"><Icon name="x" size={12} /></button
					>
				</div>
			{/if}
		</div>

		{#if node.kind === 'group'}
			<!-- children -->
			{#if isExpanded}
				{#each childNodes(store.draft.builder, node.id) as child (child.id)}
					<Self
						{store}
						nodeId={child.id}
						depth={depth + 1}
						{expandedIds}
						{onToggleExpanded}
					/>
				{/each}
				<!-- add controls -->
				<div class="flex flex-wrap items-center gap-1 py-0.5" style="padding-left:{(depth + 1) * 12}px">
					<button
						type="button"
						onclick={() => store.addBuilderGroup(nodeId)}
						class="rounded border border-dashed border-line px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
					>
						+ Group
					</button>
					{#if addingEl}
						<select
							onchange={(e) => addElement(e.currentTarget.value as BuilderElementKind)}
							class="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-600"
						>
							<option value="">kind…</option>
							{#each BUILDER_ELEMENT_KINDS as k (k.code)}
								<option value={k.code}>{k.label}</option>
							{/each}
						</select>
					{:else}
						<button
							type="button"
							onclick={() => (addingEl = true)}
							class="rounded border border-dashed border-line px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 hover:border-brand-300 hover:text-brand-600"
						>
							+ Element
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}
