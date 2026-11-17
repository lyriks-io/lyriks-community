<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Button, Icon } from '$ui/design-system';
	import type { DataStore } from '../draft-store.svelte';
	import type { ArchitectureStore } from '$ui/architecture/draft-store.svelte';
	import ArchitectureSchema from '$ui/architecture/sections/ArchitectureSchema.svelte';
	import DataMapView from './DataMapView.svelte';
	import HostInspector from './HostInspector.svelte';
	import TableInspector from './TableInspector.svelte';
	import InterfaceInspector from './InterfaceInspector.svelte';
	// The Data model (ERD) and Data inventory tabs folded into the Data map, which
	// draws the tables inside their database and machine and carries visibility.
	// import DataModelView from './DataModelView.svelte';
	// import DataInventoryView from './DataInventoryView.svelte';
	import type { DocumentSource } from '$domain/documents';
	import type { DerivedDataVisibility } from '$application/specification/data-visibility';
	import { resolveDeepLink, type BoardView } from './deep-link';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		arch: ArchitectureStore;
		/** Active tab. The route owns it (it lives in `?tab=`), so the graph tab can load server-side. */
		view: BoardView;
		/** Deep-linked draft object id (`?node=` from the graph/search) — opens the view + inspector that edits it. */
		deepLink?: string | null;
		/** Which data the client experience surfaces, read on the Data map's visibility lens. */
		derivedVisibility: DerivedDataVisibility;
		/** Rendered as the "Knowledge graph" tab; the route owns loading the graph itself. */
		graphTab: Snippet;
	}
	let {
		store,
		arch,
		view,
		deepLink = null,
		derivedVisibility,
		graphTab
	}: Props = $props();

	// Resolved once, on mount: the deep link points at the object the user arrived
	// for, and must not fight later edits or selections.
	let selection = $state<Selection>(
		untrack(() => resolveDeepLink(store.draft, arch.draft, deepLink).selection)
	);

	const surfaced = $derived(
		new Set([...derivedVisibility.entityIds, ...derivedVisibility.fieldIds])
	);

	const onSelect = (sel: Selection) => (selection = sel);

	// A selection can point at an element that was just deleted — fall back to the
	// overview so the inspector never renders against a stale id.
	const resolved = $derived.by<Selection>(() => {
		const sel = selection;
		if (sel.kind === 'host' && !store.draft.hosts.some((h) => h.id === sel.id))
			return { kind: 'none' };
		if (sel.kind === 'table' && !store.draft.entities.some((e) => e.id === sel.id))
			return { kind: 'none' };
		if (sel.kind === 'interface' && !store.draft.interfaces.some((i) => i.id === sel.id))
			return { kind: 'none' };
		return sel;
	});

	function addHost() {
		const id = store.addHost();
		selection = { kind: 'host', id };
	}
	function addInterface() {
		const id = store.addInterface();
		selection = { kind: 'interface', id };
	}

	const inspectorTitle = $derived(
		resolved.kind === 'host'
			? 'Host'
			: resolved.kind === 'table'
				? 'Table'
				: resolved.kind === 'interface'
					? 'Interface'
					: 'Overview'
	);
</script>

{#if view === 'graph'}
	{@render graphTab()}
{:else if view === 'stack'}
	<!-- The stack by repository, then by layer: the map of the architecture by
	     theme, nothing else. The non-negotiables are pinned under Requirements
	     (spec: criterion ae15ac45). The documentation sits on each choice. -->
	<section id="architecture" class="space-y-6">
		<ArchitectureSchema store={arch} />
	</section>
{:else}
	<!-- The map carries its own one-line overview; selecting a host/table/interface
     opens its editor in the right column. -->
<!-- The map fills the room the page hands it (spec: criterion e2edd5c3): on the
     large layout the route gives this block the scroll port's exact height, so the
     map and the inspector share one row that ends at the save bar and the page
     never scrolls. MAP_MIN_HEIGHT (560px) is the floor: under it the page scrolls,
     and on a narrow screen the map keeps that height inside the scrolling page. -->
<div
	class="flex flex-col lg:min-h-0 lg:flex-1"
	data-anchor={resolved.kind === 'none' ? deepLink : undefined}
>
	<div
		class="grid gap-4 lg:min-h-[560px] lg:flex-1 lg:grid-rows-[minmax(0,1fr)] {resolved.kind ===
		'none'
			? ''
			: 'lg:grid-cols-[minmax(0,1fr)_360px]'}"
	>
		<div class="h-[560px] min-w-0 lg:h-full">
			<DataMapView
				{store}
				{derivedVisibility}
				selection={resolved}
				{onSelect}
				onAddHost={addHost}
				onAddInterface={addInterface}
			/>
		</div>

		<!-- Anchored on the deep-linked id (a field/database link opens its owner's
		     inspector, so `resolved.id` alone would never match the URL's anchor).
		     On the large layout it is the row's height and scrolls inside itself. -->
		{#if resolved.kind !== 'none'}
			<aside
				data-anchor={deepLink ?? resolved.id}
				class="flex flex-col rounded-card border border-line bg-surface lg:min-h-0"
			>
				<header class="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
					<p class="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{inspectorTitle}
					</p>
					<button
						type="button"
						onclick={() => (selection = { kind: 'none' })}
						class="ml-auto text-[0.6875rem] text-ink-400 hover:text-ink-700">← overview</button
					>
				</header>
				<div class="min-h-0 flex-1 overflow-y-auto p-3">
					{#if resolved.kind === 'host'}
						<HostInspector {store} hostId={resolved.id} {onSelect} />
					{:else if resolved.kind === 'table'}
						<TableInspector {store} entityId={resolved.id} {onSelect} {surfaced} />
					{:else if resolved.kind === 'interface'}
						<InterfaceInspector {store} interfaceId={resolved.id} {onSelect} />
					{/if}
				</div>
			</aside>
		{/if}
	</div>
</div>
{/if}
