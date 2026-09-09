<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	let zoom = $state(1);
	let layout = $state<'horizontal' | 'vertical'>('horizontal');

	const screenById = $derived(new Map(store.draft.screens.map((s) => [s.id, s])));
	const templateName = (id: string | null) =>
		id ? (store.draft.templates.find((t) => t.id === id)?.name ?? null) : null;
	const linkCount = (screenId: string) =>
		store.draft.steps.filter((st) => st.linkedScreenId === screenId).length;

	// Spanning tree of screens derived from journey step-adjacency. Each journey's
	// consecutive linked screens form directed edges; we BFS a tree from the most
	// likely entry screen, then attach any unreached screens under the root.
	const tree = $derived.by(() => {
		const screens = store.draft.screens;
		if (screens.length === 0) return null;

		const adj = new Map<string, Set<string>>();
		const firstSeen = new Map<string, number>(); // times a screen is a journey's first
		const inDeg = new Map<string, number>();
		for (const s of screens) {
			adj.set(s.id, new Set());
			inDeg.set(s.id, 0);
		}
		for (const j of store.draft.journeys) {
			const linked = store.draft.steps
				.filter((st) => st.journeyId === j.id && st.linkedScreenId)
				.sort((a, b) => a.order - b.order)
				.map((st) => st.linkedScreenId!)
				.filter((id) => adj.has(id));
			if (linked[0]) firstSeen.set(linked[0], (firstSeen.get(linked[0]) ?? 0) + 1);
			for (let i = 0; i < linked.length - 1; i++) {
				const a = linked[i];
				const b = linked[i + 1];
				if (a === b) continue;
				if (!adj.get(a)!.has(b)) {
					adj.get(a)!.add(b);
					inDeg.set(b, (inDeg.get(b) ?? 0) + 1);
				}
			}
		}

		// Root = most-often-first screen, else lowest in-degree (an entry), else first.
		const rootId =
			[...firstSeen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
			[...inDeg.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ??
			screens[0].id;

		const childrenOf = new Map<string, string[]>();
		const visited = new Set<string>();
		const queue: string[] = [rootId];
		visited.add(rootId);
		childrenOf.set(rootId, []);
		while (queue.length) {
			const cur = queue.shift()!;
			for (const next of adj.get(cur) ?? []) {
				if (visited.has(next)) continue;
				visited.add(next);
				childrenOf.get(cur)!.push(next);
				childrenOf.set(next, []);
				queue.push(next);
			}
		}
		// Attach unreached screens under the root so nothing disappears.
		for (const s of screens) {
			if (!visited.has(s.id)) {
				childrenOf.get(rootId)!.push(s.id);
				childrenOf.set(s.id, []);
				visited.add(s.id);
			}
		}
		return { rootId, childrenOf };
	});
</script>

{#if !tree}
	<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
		<p class="text-sm font-semibold text-ink-700">The landscape is empty.</p>
		<p class="mt-1 text-xs text-ink-500">
			Add Screens in the <strong>Screens</strong> tab, then link them from journey steps in
			<strong>Journeys</strong>. They'll map out here.
		</p>
	</div>
{:else}
	{@const t = tree}
	<div class="space-y-3">
		<!-- toolbar -->
		<div class="flex items-center justify-between gap-3">
			<p class="text-xs text-ink-400">
				{store.draft.screens.length} screen{store.draft.screens.length === 1 ? '' : 's'} · auto-mapped
				from journey flow
			</p>
			<div class="flex items-center gap-1.5">
				<div class="inline-flex rounded-field border border-line bg-surface-sunken p-0.5">
					<button
						type="button"
						onclick={() => (layout = 'horizontal')}
						class="rounded-md px-2 py-1 text-[11px] font-semibold {layout === 'horizontal'
							? 'bg-surface text-ink-900 shadow-sm'
							: 'text-ink-400'}">Horizontal</button
					>
					<button
						type="button"
						onclick={() => (layout = 'vertical')}
						class="rounded-md px-2 py-1 text-[11px] font-semibold {layout === 'vertical'
							? 'bg-surface text-ink-900 shadow-sm'
							: 'text-ink-400'}">Vertical</button
					>
				</div>
				<button
					type="button"
					onclick={() => (zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)))}
					class="grid size-7 place-items-center rounded-field border border-line text-ink-500 hover:text-ink-700"
					title="Zoom out">−</button
				>
				<span class="w-10 text-center text-[11px] tabular-nums text-ink-400">{Math.round(zoom * 100)}%</span>
				<button
					type="button"
					onclick={() => (zoom = Math.min(2, +(zoom + 0.1).toFixed(2)))}
					class="grid size-7 place-items-center rounded-field border border-line text-ink-500 hover:text-ink-700"
					title="Zoom in">+</button
				>
			</div>
		</div>

		<!-- tree canvas -->
		<div class="overflow-auto rounded-card border border-line bg-surface-sunken/30 p-6">
			<div style="transform:scale({zoom});transform-origin:top left;width:max-content">
				{@render node(t.rootId)}
			</div>
		</div>
	</div>

	{#snippet node(id: string)}
		{@const screen = screenById.get(id)}
		{@const kids = t.childrenOf.get(id) ?? []}
		{#if screen}
			<div class="flex {layout === 'horizontal' ? 'flex-row items-center' : 'flex-col items-center'} gap-3">
				<!-- card -->
				<div class="w-45 shrink-0 rounded-xl border border-line bg-surface p-2.5 shadow-card">
					<div class="flex items-center gap-1.5">
						<span class="grid size-5 place-items-center rounded bg-accent-50 text-accent-600">
							<Icon name="monitor" size={12} />
						</span>
						<span class="min-w-0 flex-1 truncate text-xs font-semibold text-ink-900">
							{screen.name || 'Untitled screen'}
						</span>
					</div>
					<div class="mt-1 flex items-center gap-1.5 text-[10px] text-ink-400">
						{#if templateName(screen.templateId)}
							<span class="truncate text-brand-500">⊂ {templateName(screen.templateId)}</span>
						{/if}
						{#if linkCount(id) > 0}
							<span class="ml-auto shrink-0">{linkCount(id)} link{linkCount(id) === 1 ? '' : 's'}</span>
						{/if}
					</div>
				</div>

				<!-- children -->
				{#if kids.length > 0}
					<div
						class="flex gap-3 {layout === 'horizontal'
							? 'flex-col border-l border-line pl-5'
							: 'flex-row border-t border-line pt-5'}"
					>
						{#each kids as kid (kid)}
							{@render node(kid)}
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
{/if}
