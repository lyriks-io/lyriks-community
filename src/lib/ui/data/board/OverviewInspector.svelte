<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import type { DataStore } from '../draft-store.svelte';
	import { interfaceResolves, type Selection } from './selection';

	interface Props {
		store: DataStore;
		onSelect: (sel: Selection) => void;
		/** Lay the whole-picture out as a horizontal banner (above the map) rather
		 * than the right-hand inspector column. */
		horizontal?: boolean;
	}
	let { store, onSelect, horizontal = false }: Props = $props();

	const placedTables = $derived(store.draft.entities.filter((e) => e.databaseId).length);
	const unplaced = $derived(store.draft.entities.filter((e) => e.databaseId === null));
	const brokenInterfaces = $derived(
		store.draft.interfaces.filter((i) => !interfaceResolves(store, i.fromBrick, i.toBrick))
	);

	const stats = $derived([
		{ label: 'Hosts', value: store.draft.hosts.length, icon: 'server' as const },
		{ label: 'Databases', value: store.draft.databases.length, icon: 'database' as const },
		{ label: 'Tables', value: `${placedTables}/${store.draft.entities.length}`, icon: 'grid' as const },
		{ label: 'Interfaces', value: store.draft.interfaces.length, icon: 'arrow-right' as const }
	]);
</script>

{#if horizontal}
	<!-- ── Horizontal banner (above the servers) ─────────────────────────── -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-2.5">
		<div class="mr-1 shrink-0">
			<p class="text-sm font-bold text-ink-900">The whole picture</p>
			<p class="text-[10px] text-ink-400">Click any district, table or link on the map to edit it.</p>
		</div>
		<div class="flex flex-wrap items-stretch gap-2">
			{#each stats as s (s.label)}
				<div class="rounded-field border border-line bg-surface-sunken/40 px-3 py-1.5">
					<div class="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-ink-400">
						<Icon name={s.icon} size={11} />
						{s.label}
					</div>
					<p class="text-lg font-bold leading-none text-ink-900">{s.value}</p>
				</div>
			{/each}
		</div>
		<div class="min-w-0 flex-1"></div>
		{#if store.missingTables.length > 0}
			<div class="flex items-center gap-2 rounded-field border border-warning-300 bg-warning-50/50 px-2.5 py-1.5">
				<Icon name="info" size={13} class="shrink-0 text-warning-700" />
				<span class="text-[11px] text-warning-700">
					<strong>{store.missingTables.length}</strong> table(s) not modeled
				</span>
				<Button variant="outline" size="sm" onclick={store.deriveEntities}>
					<Icon name="rotate" size={12} /> Derive
				</Button>
			</div>
		{/if}
		{#if brokenInterfaces.length > 0}
			<div class="flex flex-wrap items-center gap-1.5">
				{#each brokenInterfaces as i (i.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'interface', id: i.id })}
						class="inline-flex items-center gap-1.5 rounded-field border border-warning-200 bg-warning-50/40 px-2 py-1 text-[11px] text-warning-700 hover:border-warning-400"
					>
						<Icon name="arrow-right" size={11} class="shrink-0" />
						<span class="max-w-40 truncate">{i.fromBrick || '-'} → {i.toBrick || '-'}</span>
						<span class="text-[10px]">fix ↗</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{:else}
<div class="space-y-4">
	<div>
		<p class="text-base font-bold text-ink-900">The whole picture</p>
		<p class="text-[11px] text-ink-400">
			Click any district, table or link on the map to edit it here.
		</p>
	</div>

	<div class="grid grid-cols-2 gap-2">
		{#each stats as s (s.label)}
			<div class="rounded-field border border-line bg-surface-sunken/40 px-3 py-2">
				<div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
					<Icon name={s.icon} size={12} />
					{s.label}
				</div>
				<p class="mt-0.5 text-xl font-bold text-ink-900">{s.value}</p>
			</div>
		{/each}
	</div>

	<!-- forgotten tables (derived from journeys) -->
	{#if store.missingTables.length > 0}
		<div class="rounded-card border border-warning-300 bg-warning-50/50 p-3">
			<p class="flex items-start gap-1.5 text-[11px] text-warning-700">
				<Icon name="info" size={13} class="mt-px shrink-0" />
				<span>
					<strong>{store.missingTables.length} table(s)</strong> your journeys reference aren't modeled yet:
					{store.missingTables.join(', ')}.
				</span>
			</p>
			<Button variant="outline" size="sm" class="mt-2" onclick={store.deriveEntities}>
				<Icon name="rotate" size={13} /> Derive them from journeys
			</Button>
		</div>
	{:else}
		<p class="flex items-center gap-1.5 text-[11px] text-success-600">
			<Icon name="check" size={13} /> Every table your journeys reference exists.
		</p>
	{/if}

	<!-- unplaced tables -->
	{#if unplaced.length > 0}
		<div>
			<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Unplaced tables ({unplaced.length}) - not on any host
			</p>
			<div class="flex flex-wrap gap-1.5">
				{#each unplaced as e (e.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'table', id: e.id })}
						class="rounded-pill border border-danger-200 bg-danger-50 px-2 py-0.5 text-[11px] text-danger-600 hover:border-danger-400"
						>{e.name || 'Untitled'}</button
					>
				{/each}
			</div>
		</div>
	{/if}

	<!-- broken interfaces -->
	{#if brokenInterfaces.length > 0}
		<div>
			<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Interfaces not on the map ({brokenInterfaces.length})
			</p>
			<div class="space-y-1">
				{#each brokenInterfaces as i (i.id)}
					<button
						type="button"
						onclick={() => onSelect({ kind: 'interface', id: i.id })}
						class="flex w-full items-center gap-1.5 rounded-field border border-warning-200 bg-warning-50/40 px-2 py-1 text-left text-[11px] text-warning-700 hover:border-warning-400"
					>
						<Icon name="arrow-right" size={11} class="shrink-0" />
						<span class="truncate">{i.fromBrick || '-'} → {i.toBrick || '-'}</span>
						<span class="ml-auto text-[10px]">fix ↗</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="rounded-field border border-dashed border-line px-3 py-2 text-[11px] text-ink-400">
		Tip: open a table and change its database to move it to another host.
	</div>
</div>
{/if}
