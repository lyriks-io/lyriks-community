<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Button, Icon } from '$ui/design-system';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import {
		COMPONENT_COLORS,
		themeStyleVars,
		markerStyleVars,
		type ComponentColor
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import NodeRenderer from '../builder/NodeRenderer.svelte';
	import Builder from '../builder/Builder.svelte';
	import TemplatesPanel from './TemplatesPanel.svelte';

	interface Props {
		store: ExperienceStore;
		/** Step-03 roles, threaded to the inline Builder for persona gates. */
		roles: { id: string; name: string }[];
	}
	let { store, roles }: Props = $props();

	// Hex swatches for the accent dot (component colors aren't in the token set).
	const COLOR_HEX: Record<ComponentColor, string> = {
		violet: '#8b5cf6',
		blue: '#3b82f6',
		pink: '#ec4899',
		amber: '#f59e0b',
		mint: '#10b981'
	};

	// The reuse library splits into three sub-views on one SectionNav rail (the
	// Foundation Ops pattern). A deep-link (`?node=<id>`) must land on the view
	// that holds the anchor, or it has nothing to flash.
	type View = 'components' | 'templates' | 'elements';
	let view = $state<View>(
		untrack(() => {
			const node = page.url.searchParams.get('node');
			if (node && store.draft.elements.some((el) => el.id === node)) return 'elements';
			if (node && store.draft.templates.some((t) => t.id === node)) return 'templates';
			return 'components';
		})
	);

	const components = $derived(store.draft.components);
	const theme = $derived(store.draft.builder.theme);

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Reuse library',
			items: [
				{
					id: 'components',
					label: 'Components',
					hint: 'UI blocks, shown as they render',
					icon: 'layers',
					count: components.length
				},
				{
					id: 'templates',
					label: 'Templates',
					hint: 'Reusable screen layouts',
					icon: 'grid',
					count: store.draft.templates.length
				},
				{
					id: 'elements',
					label: 'Elements',
					hint: 'Atomic named bricks',
					icon: 'tag',
					count: store.draft.elements.length
				}
			]
		}
	]);

	type Filter = 'all' | 'designed' | 'empty';
	let filter = $state<Filter>('all');
	let search = $state('');
	/** The component whose layout is open for inline editing (one at a time). */
	let editingId = $state<string | null>(null);

	/** A component's reusable tree lives under screenRoots[id]; null until designed. */
	const rootOf = (id: string): string | null => store.draft.builder.screenRoots[id] ?? null;
	const isDesigned = (id: string): boolean => rootOf(id) !== null && !store.isSurfaceEmpty(id);

	// Which screens place this component is derived from the builder tree (Phase B).
	const usageOf = (_componentId: string): string[] => [];

	const filtered = $derived.by(() => {
		let list = components;
		if (search.trim())
			list = list.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
		if (filter === 'designed') list = list.filter((c) => isDesigned(c.id));
		if (filter === 'empty') list = list.filter((c) => !isDesigned(c.id));
		return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
	});

	const designedCount = $derived(components.filter((c) => isDesigned(c.id)).length);

	const filterPills: { id: Filter; label: string; count: number }[] = $derived([
		{ id: 'all', label: 'All', count: components.length },
		{ id: 'designed', label: 'Designed', count: designedCount },
		{ id: 'empty', label: 'Not designed', count: components.length - designedCount }
	]);

	// Open a component's layout for inline editing — ensures its root tree exists
	// (so a brand-new component is immediately editable) and expands the card.
	function edit(id: string) {
		if (editingId === id) {
			editingId = null;
			return;
		}
		store.openBuilderComponent(id);
		editingId = id;
	}

	function addComponent() {
		editingId = store.addComponent({ name: 'New component' });
		store.openBuilderComponent(editingId);
	}
</script>

<SectionNav groups={navGroups} active={view} onSelect={(id) => (view = id as View)}>
	{#if view === 'components'}
		<div class="space-y-4">
			<div class="flex flex-wrap items-center gap-2">
				<!-- filter pills -->
				<div class="inline-flex rounded-field border border-line bg-surface-sunken p-0.5">
					{#each filterPills as p (p.id)}
						<button
							type="button"
							onclick={() => (filter = p.id)}
							class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors {filter === p.id
								? 'bg-surface text-ink-900 shadow-sm'
								: 'text-ink-400 hover:text-ink-700'}"
						>
							{p.label}<span class="ml-1 text-[10px] text-ink-400">{p.count}</span>
						</button>
					{/each}
				</div>
				<div class="relative">
					<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300">
						<Icon name="search" size={14} />
					</span>
					<input
						bind:value={search}
						placeholder="Search…"
						class="w-48 rounded-field border border-line bg-surface py-1.5 pl-8 pr-3 text-xs text-ink-700 outline-none focus:border-brand-300 placeholder:text-ink-300"
					/>
				</div>
				<div class="ml-auto">
					<Button variant="outline" size="sm" onclick={addComponent}>
						<Icon name="plus" size={14} /> Component
					</Button>
				</div>
			</div>

			{#if components.length === 0}
				<p class="rounded-card border border-dashed border-line px-4 py-6 text-center text-xs text-ink-400">
					No component yet. Components are reusable UI blocks shared across screens - add one, then design
					its layout to see it render here.
				</p>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each filtered as c (c.id)}
						{@const rootId = rootOf(c.id)}
						{@const designed = isDesigned(c.id)}
						{@const editing = editingId === c.id}
						{@const usage = usageOf(c.id)}
						<div
							data-anchor={c.id}
							class="flex flex-col overflow-hidden rounded-card border bg-surface transition-colors {editing
								? 'border-brand-300 shadow-card sm:col-span-2 xl:col-span-3'
								: 'border-line'}"
						>
							<!-- header -->
							<div class="flex items-center gap-2 px-3 py-2">
								<span class="size-2.5 shrink-0 rounded-full" style="background:{COLOR_HEX[c.color]}"></span>
								<input
									value={c.name}
									oninput={(e) => store.updateComponent(c.id, 'name', e.currentTarget.value)}
									placeholder="Component name"
									class="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
								/>
								<select
									value={c.color}
									onchange={(e) =>
										store.updateComponent(c.id, 'color', e.currentTarget.value as ComponentColor)}
									class="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-500"
								>
									{#each COMPONENT_COLORS as col (col.code)}
										<option value={col.code}>{col.label}</option>
									{/each}
								</select>
								<button
									type="button"
									onclick={() => edit(c.id)}
									class="shrink-0 rounded-field border px-2 py-0.5 text-[10px] font-semibold transition-colors {editing
										? 'border-brand-300 bg-brand-50 text-brand-600'
										: 'border-line text-ink-500 hover:text-brand-600'}"
								>
									{editing ? 'Close' : 'Edit layout'}
								</button>
								<button
									type="button"
									onclick={() => {
										if (editing) editingId = null;
										store.removeComponent(c.id);
									}}
									class="shrink-0 text-ink-300 hover:text-danger-500"><Icon name="x" size={15} /></button
								>
							</div>

							{#if editing}
								<!-- Inline visual editor — design the reusable tree right here. -->
								<div class="border-t border-line p-3">
									<Builder {store} screenId={c.id} surfaceKind="component" {roles} />
								</div>
							{:else}
								<!-- Live visual preview: the component rendered exactly as it appears
								     on a screen (sample data, the project theme), non-interactive. -->
								<button
									type="button"
									onclick={() => edit(c.id)}
									title="Edit this component's layout"
									class="sim-scope group relative block h-44 w-full overflow-hidden border-y border-line text-left"
									style="{themeStyleVars(theme)};{markerStyleVars(
										store.draft.brand.markers
									)};background:var(--sim-bg)"
								>
									{#if designed && rootId}
										<div
											class="pointer-events-none absolute inset-0 overflow-hidden p-3"
											style="font-family:var(--sim-font);color:var(--sim-ink)"
										>
											<NodeRenderer {store} nodeId={rootId} mode="run" />
										</div>
										<span
											class="absolute right-2 top-2 rounded bg-ink-900/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100"
										>
											Edit
										</span>
									{:else}
										<span
											class="absolute inset-0 grid place-items-center gap-1 text-center"
											style="color:var(--sim-muted)"
										>
											<span class="grid place-items-center gap-1">
												<Icon name="grid" size={20} />
												<span class="text-xs font-medium">Not designed yet</span>
												<span class="text-[11px] font-semibold text-brand-500 group-hover:text-brand-600"
													>Design layout →</span
												>
											</span>
										</span>
									{/if}
								</button>
							{/if}

							<!-- description + usage -->
							<div class="px-3 py-2">
								<input
									value={c.description}
									oninput={(e) => store.updateComponent(c.id, 'description', e.currentTarget.value)}
									placeholder="What is this component? (optional)"
									class="w-full border-none bg-transparent text-xs text-ink-500 outline-none placeholder:text-ink-300"
								/>
								<p class="mt-0.5 text-[11px] text-ink-400">
									{#if usage.length > 0}
										Used on: {usage.join(', ')}
									{:else}
										<span class="italic text-ink-300">Not yet placed on a screen</span>
									{/if}
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else if view === 'templates'}
		<!-- Screen-sized reusable layouts — the other half of the reuse library. -->
		<TemplatesPanel {store} {roles} />
	{:else}
		<!-- Atomic elements (a separate, lighter library concept). -->
		<div class="space-y-2 rounded-card border border-line bg-surface p-3">
			{#each store.draft.elements as el (el.id)}
				<div data-anchor={el.id} class="flex items-center gap-2">
					<Icon name="tag" size={13} class="text-ink-400" />
					<input
						value={el.name}
						oninput={(e) => store.updateElement(el.id, 'name', e.currentTarget.value)}
						placeholder="Element name"
						class="min-w-0 flex-1 border-none bg-transparent text-xs font-medium text-ink-800 outline-none placeholder:text-ink-300"
					/>
					<button
						type="button"
						onclick={() => store.removeElement(el.id)}
						class="text-ink-300 hover:text-danger-500"><Icon name="x" size={14} /></button
					>
				</div>
			{:else}
				<p class="py-3 text-center text-xs text-ink-400">
					No element yet. Elements are atomic named bricks you can reference from layouts.
				</p>
			{/each}
			<button
				type="button"
				onclick={() => store.addElement()}
				class="text-[11px] font-semibold text-brand-500 hover:text-brand-600"
			>
				+ Element
			</button>
		</div>
	{/if}
</SectionNav>
