<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Button, Icon, type IconName } from '$ui/design-system';
	import type { DataStore } from '../draft-store.svelte';
	import type { ArchitectureStore } from '$ui/architecture/draft-store.svelte';
	import ArchitectureSchema from '$ui/architecture/sections/ArchitectureSchema.svelte';
	import ReferenceDocs from '$ui/architecture/sections/ReferenceDocs.svelte';
	import Constraints from '$ui/architecture/sections/Constraints.svelte';
	import InfraCanvas from './InfraCanvas.svelte';
	import HostInspector from './HostInspector.svelte';
	import TableInspector from './TableInspector.svelte';
	import InterfaceInspector from './InterfaceInspector.svelte';
	import OverviewInspector from './OverviewInspector.svelte';
	import DataModelView from './DataModelView.svelte';
	import DataInventoryView from './DataInventoryView.svelte';
	import type { DocumentSource } from '$domain/documents';
	import type { DerivedDataVisibility } from '$application/data-visibility';
	import { resolveDeepLink, type BoardView } from './deep-link';
	import type { Selection } from './selection';

	interface Props {
		store: DataStore;
		arch: ArchitectureStore;
		/** Active tab. The route owns it (it lives in `?tab=`), so the graph tab can load server-side. */
		view: BoardView;
		onView: (view: BoardView) => void;
		/** Deep-linked draft object id (`?node=` from the graph/search) — opens the view + inspector that edits it. */
		deepLink?: string | null;
		/** Which data the client experience surfaces — for the Data inventory tab. */
		derivedVisibility: DerivedDataVisibility;
		/** Rendered as the "Knowledge graph" tab; the route owns loading the graph itself. */
		graphTab: Snippet;
		/** Behavior-model resource reconciliation on the Architecture tab; the route streams it. */
		resourcesPanel: Snippet;
	}
	let {
		store,
		arch,
		view,
		onView,
		deepLink = null,
		derivedVisibility,
		graphTab,
		resourcesPanel
	}: Props = $props();

	// Resolved once, on mount: the deep link points at the object the user arrived
	// for, and must not fight later edits or selections.
	let selection = $state<Selection>(
		untrack(() => resolveDeepLink(store.draft, arch.draft, deepLink).selection)
	);

	const TABS: { v: BoardView; label: string; eyebrow: string; icon: IconName }[] = [
		{ v: 'map', label: 'Infra map', eyebrow: 'Hosts & interfaces', icon: 'server' },
		{ v: 'model', label: 'Data model', eyebrow: 'Entities & fields', icon: 'database' },
		{ v: 'inventory', label: 'Data inventory', eyebrow: 'Client visibility', icon: 'eye' },
		{ v: 'stack', label: 'Architecture', eyebrow: 'Stack & constraints', icon: 'sliders' },
		{ v: 'graph', label: 'Knowledge graph', eyebrow: 'Every context, one graph', icon: 'layers' }
	];

	let showInterfaces = $state(true);
	// FK links are off by default — the canvas stays readable until you opt in.
	let showRelations = $state(false);

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

<!-- Primary view switch — white pill bar, gradient on the active tab (matches Users/Features). -->
<div
	class="mb-4 inline-flex shrink-0 flex-wrap gap-1 rounded-card border border-line bg-surface p-1.5"
	role="tablist"
>
	{#each TABS as t (t.v)}
		{@const isActive = view === t.v}
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			onclick={() => onView(t.v)}
			class="flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-left transition {isActive
				? 'gradient-violet text-white shadow-md shadow-brand-500/20'
				: 'text-ink-500 hover:bg-surface-sunken'}"
		>
			<Icon name={t.icon} size={16} />
			<span class="text-left">
				<span class="block text-sm font-semibold leading-tight">{t.label}</span>
				<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
					{t.eyebrow}
				</span>
			</span>
		</button>
	{/each}
</div>

{#if view === 'model'}
	<DataModelView {store} />
{:else if view === 'inventory'}
	<DataInventoryView {store} {derivedVisibility} />
{:else if view === 'graph'}
	{@render graphTab()}
{:else if view === 'stack'}
	<!-- tech stack, reference docs & constraints — now a first-class tab -->
	<section id="architecture" class="space-y-6">
		<ArchitectureSchema store={arch} />
		<!-- Checks the behavior model against the infra map and lists only what the
		     map cannot show, so this never becomes a second copy of the map. -->
		{@render resourcesPanel()}
		<div class="grid gap-6 lg:grid-cols-2">
			<ReferenceDocs store={arch} />
			<Constraints store={arch} />
		</div>
	</section>
{:else}
	<!-- toolbar: actions + lenses -->
	<div class="mb-4 flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={addHost}>
			<Icon name="plus" size={14} /> Host
		</Button>
		<Button variant="outline" size="sm" onclick={addInterface}>
			<Icon name="plus" size={14} /> Interface
		</Button>

		<div class="ml-auto inline-flex items-center gap-1 rounded-field border border-line bg-surface p-0.5 text-[11px]">
		<button
			type="button"
			onclick={() => (showRelations = !showRelations)}
			class="rounded-[5px] px-2 py-1 font-semibold transition-colors {showRelations
				? 'bg-surface-sunken text-ink-900'
				: 'text-ink-400 hover:text-ink-700'}"
			aria-pressed={showRelations}
		>
			FK links
		</button>
		<button
			type="button"
			onclick={() => (showInterfaces = !showInterfaces)}
			class="rounded-[5px] px-2 py-1 font-semibold transition-colors {showInterfaces
				? 'bg-surface-sunken text-ink-900'
				: 'text-ink-400 hover:text-ink-700'}"
			aria-pressed={showInterfaces}
		>
			Interfaces
		</button>
	</div>
</div>

<!-- The whole-picture overview sits as a horizontal banner ABOVE the servers;
     selecting a host/table/interface opens its editor in the right column. -->
<div class="space-y-4">
	<div data-anchor={resolved.kind === 'none' ? deepLink : undefined}>
		<OverviewInspector {store} {onSelect} horizontal />
	</div>

	<div class="grid gap-4 {resolved.kind === 'none' ? '' : 'lg:grid-cols-[1fr_360px]'}">
		<div class="min-w-0">
			<InfraCanvas {store} selection={resolved} {onSelect} {showInterfaces} {showRelations} />
		</div>

		<!-- Anchored on the deep-linked id (a field/database link opens its owner's
		     inspector, so `resolved.id` alone would never match the URL's anchor). -->
		<!-- Pinned to the top of the page's scroll area and filling every pixel down
		     to the save bar: `top-0` because the sticky containing block IS that
		     scroll area (it already starts under the top bar), and the height is the
		     viewport minus the two chrome strips that frame it — the 3.5rem top bar
		     and the 61px local-coherence save bar (36px ring + 1.5rem padding + border). -->
		{#if resolved.kind !== 'none'}
			<aside
				data-anchor={deepLink ?? resolved.id}
				class="flex flex-col rounded-card border border-line bg-surface lg:sticky lg:top-0 lg:h-[calc(100dvh-3.5rem-61px)] lg:self-start"
			>
				<header class="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
					<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{inspectorTitle}
					</p>
					<button
						type="button"
						onclick={() => (selection = { kind: 'none' })}
						class="ml-auto text-[11px] text-ink-400 hover:text-ink-700">← overview</button
					>
				</header>
				<div class="min-h-0 flex-1 overflow-y-auto p-3">
					{#if resolved.kind === 'host'}
						<HostInspector {store} hostId={resolved.id} {onSelect} />
					{:else if resolved.kind === 'table'}
						<TableInspector {store} entityId={resolved.id} {onSelect} />
					{:else if resolved.kind === 'interface'}
						<InterfaceInspector {store} interfaceId={resolved.id} {onSelect} />
					{/if}
				</div>
			</aside>
		{/if}
	</div>
</div>
{/if}
