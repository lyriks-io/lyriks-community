<script lang="ts">
	import { untrack } from 'svelte';
	import { MapPlacementsStore } from './map-placements.svelte';
	import { Icon, SearchInput } from '$ui/design-system';
	import ToolbarMenu from './ToolbarMenu.svelte';
	import { DB_ENGINES, HOST_KINDS, type EntityOrigin } from '$domain/data';
	import type { DerivedDataVisibility } from '$application/specification/data-visibility';
	import type { DataStore } from '../draft-store.svelte';
	import { ENGINE_HEX, HOST_TYPE_HEX, PROTOCOL_HEX } from '../infra-style';
	import ErdCanvas from './ErdCanvas.svelte';
	import CardinalityLegend from './CardinalityLegend.svelte';
	import {
		EMPTY_FILTER,
		LENSES,
		ORIGIN_HEX,
		ORIGIN_LABEL,
		UNPLACED_HEX,
		VISIBILITY_HEX,
		VISIBILITY_LABEL,
		filterTables,
		isFiltering,
		layoutMap,
		visibilityAnomalies,
		type GroupBy,
		type Lens,
		type LinkMode,
		type MapFilter,
		type VisibilityStatus
	} from './data-map';
	import { interfaceResolves, type Selection } from './selection';

	interface Props {
		store: DataStore;
		/** Which data the client experience surfaces (server-side cross-check). */
		derivedVisibility: DerivedDataVisibility;
		selection: Selection;
		onSelect: (sel: Selection) => void;
		onAddHost: () => void;
		onAddInterface: () => void;
	}
	let { store, derivedVisibility, selection, onSelect, onAddHost, onAddInterface }: Props =
		$props();

	const surfaced = $derived(
		new Set([...derivedVisibility.entityIds, ...derivedVisibility.fieldIds])
	);
	const ctx = $derived({ draft: store.draft, derived: surfaced });

	let lens = $state<Lens>('database');
	let filter = $state<MapFilter>({ ...EMPTY_FILTER });
	// Every relation, like any ERD: grey and thin, colored only around the focused table.
	let links = $state<LinkMode>('all');
	let keysOnly = $state(false);
	let groupBy = $state<GroupBy>('location');
	const LINK_MODES: { id: LinkMode; label: string; title: string }[] = [
		{ id: 'all', label: 'All', title: 'Every relation line' },
		{ id: 'focused', label: 'Focused', title: 'Only the lines of the table you hover or select' },
		{ id: 'off', label: 'Off', title: 'No relation line' }
	];
	let showInterfaces = $state(false);
	// Where people put the tables by hand, kept for the project apart from the spec (criterion 7f5769bb).
	const placements = new MapPlacementsStore(untrack(() => store.draft.projectId), null);
	const place = (id: string, x: number, y: number, done: boolean) => {
		placements.move(id, x, y);
		if (done) void placements.drop(id);
	};

	const filtering = $derived(isFiltering(filter));
	const result = $derived(filterTables(ctx, filter));
	const layout = $derived(layoutMap(store.draft, result.entityIds, { keepEmpty: !filtering, keysOnly, groupBy, placements: placements.doc }));
	const fitKey = $derived([...result.entityIds].sort().join(',') + (keysOnly ? ':keys' : '') + ':' + groupBy);
	const anomalies = $derived(visibilityAnomalies(store.draft, surfaced));

	// The whole picture, read as one line of text: counts first, then what needs a look.
	const placedTables = $derived(store.draft.entities.filter((e) => e.databaseId).length);
	const offMap = $derived(
		store.draft.interfaces.filter((i) => !interfaceResolves(store, i.fromBrick, i.toBrick))
	);
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const counts = $derived([
		plural(store.draft.hosts.length, 'host', 'hosts'),
		plural(store.draft.databases.length, 'database', 'databases'),
		placedTables === store.draft.entities.length
			? plural(store.draft.entities.length, 'table', 'tables')
			: `${placedTables}/${store.draft.entities.length} tables placed`,
		plural(store.draft.interfaces.length, 'interface', 'interfaces')
	]);

	// The database filter follows the machine filter, so it never offers an impossible pair.
	const dbOptions = $derived(
		store.draft.databases.filter(
			(d) =>
				!filter.hostId ||
				(filter.hostId === '__none__' ? !d.hostId : d.hostId === filter.hostId)
		)
	);

	function addTable() {
		const id = store.addEntity({ derivedFrom: 'manual' });
		onSelect({ kind: 'table', id });
	}


	const ORIGINS: EntityOrigin[] = ['journey', 'feature', 'manual'];
	const STATUSES: VisibilityStatus[] = ['visible', 'hidden', 'anomaly'];
	const usedEngines = $derived(
		DB_ENGINES.filter((e) => store.draft.databases.some((d) => d.engine === e.code))
	);
	const usedProtocols = $derived(
		[...new Set(store.draft.interfaces.map((i) => i.protocol))]
	);
	// One chip per active filter, labelled as the panel labels it.
	const chips = $derived.by(() => {
		const out: { key: 'hostId' | 'databaseId' | 'origin' | 'visibility'; label: string }[] = [];
		if (filter.hostId)
			out.push({
				key: 'hostId',
				label: `Machine: ${filter.hostId === '__none__' ? 'none' : store.draft.hosts.find((h) => h.id === filter.hostId)?.name || 'Host'}`
			});
		if (filter.databaseId)
			out.push({
				key: 'databaseId',
				label: `Database: ${filter.databaseId === '__none__' ? 'none' : store.draft.databases.find((d) => d.id === filter.databaseId)?.name || 'Untitled'}`
			});
		if (filter.origin) out.push({ key: 'origin', label: `Origin: ${ORIGIN_LABEL[filter.origin]}` });
		if (filter.visibility) out.push({ key: 'visibility', label: VISIBILITY_LABEL[filter.visibility] });
		return out;
	});
	// How many view settings depart from the defaults, shown on the View button.
	const viewChanges = $derived(
		[groupBy !== 'location', lens !== 'database', links !== 'all', keysOnly, showInterfaces].filter(Boolean).length
	);
	const menuItem =
		'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-700 hover:bg-surface-sunken';
	const fieldCls = 'grid gap-1';
	const fieldLabel = 'text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400';
	const selectCls =
		'h-8 w-full rounded-field border border-line bg-surface px-2 text-xs text-ink-700 focus:border-brand-400 focus:outline-none';
</script>

<div class="flex h-full min-h-0 flex-col gap-3">
	<!-- toolbar: one quiet row; adding, filtering and the view settings wait behind menus -->
	<div class="flex shrink-0 flex-wrap items-center gap-2">
		<ToolbarMenu label="Add" icon="plus" role="menu">
			{#snippet children(close)}
				<div class="flex w-40 flex-col text-xs">
					<button type="button" class={menuItem} onclick={() => { close(); addTable(); }}><Icon name="table" size={13} /> Table</button>
					<button type="button" class={menuItem} onclick={() => { close(); onAddHost(); }}><Icon name="server" size={13} /> Host</button>
					<button type="button" class={menuItem} onclick={() => { close(); onAddInterface(); }}><Icon name="arrow-right" size={13} /> Interface</button>
				</div>
			{/snippet}
		</ToolbarMenu>

		<SearchInput
			bind:value={filter.query}
			placeholder="Find a table, field or type…"
			class="w-64"
			resultLabel={filtering ? `${result.entityIds.size} of ${store.draft.entities.length} tables` : null}
		/>

		<ToolbarMenu label="Filters" icon="sliders" active={chips.length}>
			{#snippet children()}
				<div class="grid w-72 gap-3 text-xs">
					<label class={fieldCls}>
						<span class={fieldLabel}>Machine</span>
						<select bind:value={filter.hostId} onchange={() => (filter.databaseId = '')} class={selectCls}>
							<option value="">All machines</option>
							{#each store.draft.hosts as h (h.id)}
								<option value={h.id}>{h.name || 'Host'}</option>
							{/each}
							<option value="__none__">Not on a machine</option>
						</select>
					</label>
					<label class={fieldCls}>
						<span class={fieldLabel}>Database</span>
						<select bind:value={filter.databaseId} class={selectCls}>
							<option value="">All databases</option>
							{#each dbOptions as d (d.id)}
								<option value={d.id}>{d.name || 'Untitled database'}</option>
							{/each}
							<option value="__none__">No database yet</option>
						</select>
					</label>
					<label class={fieldCls}>
						<span class={fieldLabel}>Origin</span>
						<select bind:value={filter.origin} class={selectCls}>
							<option value="">Any origin</option>
							{#each ORIGINS as o (o)}
								<option value={o}>{ORIGIN_LABEL[o]}</option>
							{/each}
						</select>
					</label>
					<label class={fieldCls}>
						<span class={fieldLabel}>Client visibility</span>
						<select bind:value={filter.visibility} class={selectCls}>
							<option value="">Any visibility</option>
							{#each STATUSES as s (s)}
								<option value={s}>{VISIBILITY_LABEL[s]}</option>
							{/each}
						</select>
					</label>
				</div>
			{/snippet}
		</ToolbarMenu>

		<!-- what is filtered stays visible, one removable chip per filter -->
		{#each chips as c (c.key)}
			<button
				type="button"
				onclick={() => (filter = { ...filter, [c.key]: '', ...(c.key === 'hostId' ? { databaseId: '' } : {}) })}
				class="inline-flex items-center gap-1 rounded-pill border border-brand-200 bg-brand-50 px-2.5 py-1 text-[0.6875rem] font-medium text-brand-600 hover:border-brand-300"
				title="Remove this filter"
			>
				{c.label} <Icon name="x" size={11} />
			</button>
		{/each}
		{#if chips.length > 1}
			<button type="button" onclick={() => (filter = { ...EMPTY_FILTER, query: filter.query })} class="text-[0.6875rem] text-ink-400 hover:text-ink-700">Clear all</button>
		{/if}

		<div class="ml-auto">
			<ToolbarMenu label="View" icon="eye" align="right" active={viewChanges}>
				{#snippet children()}
					<div class="grid w-72 gap-3 text-xs">
						<label class={fieldCls}>
							<span class={fieldLabel}>Group by</span>
							<select bind:value={groupBy} class={selectCls}>
								<option value="location">Machine &amp; database</option>
								<option value="origin">Origin</option>
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Color by</span>
							<select bind:value={lens} class={selectCls}>
								{#each LENSES as l (l.id)}
									<option value={l.id}>{l.label}</option>
								{/each}
							</select>
						</label>
						<div class={fieldCls}>
							<span class={fieldLabel}>FK links</span>
							<div class="inline-flex rounded-field border border-line bg-surface-sunken p-0.5" role="group" aria-label="Relation lines">
								{#each LINK_MODES as m (m.id)}
									<button
										type="button"
										onclick={() => (links = m.id)}
										aria-pressed={links === m.id}
										title={m.title}
										class="flex-1 px-2 py-1 font-semibold {links === m.id ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-400 hover:text-ink-700'}"
									>
										{m.label}
									</button>
								{/each}
							</div>
						</div>
						<label class="flex cursor-pointer items-center gap-2 text-ink-700">
							<input type="checkbox" bind:checked={keysOnly} class="accent-brand-500" />
							Keys only <span class="text-ink-400">(PK, FK and UK rows)</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-ink-700">
							<input type="checkbox" bind:checked={showInterfaces} class="accent-brand-500" />
							Interfaces <span class="text-ink-400">(wires between bricks)</span>
						</label>
						{#if placements.count > 0}
							<!-- Every table back where the layout places it (criterion 7f5769bb). -->
							<button type="button" class={menuItem} title="Put every table back where the layout places it" onclick={() => void placements.arrange()}
								><Icon name="grid" size={13} /> Arrange automatically <span class="text-ink-400">({placements.count} moved)</span></button
							>
						{/if}
					</div>
				{/snippet}
			</ToolbarMenu>
		</div>
	</div>

	<!-- the whole picture: one quiet line; problems are short links at its end -->
	<div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-500">
		<span>{counts.join(' · ')}</span>
		{#if offMap.length > 0 || store.missingTables.length > 0 || anomalies.length > 0}
			<span class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
				{#if offMap.length > 0}
					<ToolbarMenu
						label="{plural(offMap.length, 'interface', 'interfaces')} off the map"
						icon="arrow-right"
						look="link"
						align="right"
						role="menu"
					>
						{#snippet children(close)}
							<div class="flex w-64 flex-col text-xs">
								<p class="px-2 pb-1.5 text-[0.6875rem] text-ink-400">An end names no host or table on the map.</p>
								{#each offMap as i (i.id)}
									<button
										type="button"
										class={menuItem}
										onclick={() => { close(); onSelect({ kind: 'interface', id: i.id }); }}
									>
										<span class="truncate">{i.fromBrick || '-'} → {i.toBrick || '-'}</span>
									</button>
								{/each}
							</div>
						{/snippet}
					</ToolbarMenu>
				{/if}
				{#if store.missingTables.length > 0}
					<button
						type="button"
						onclick={store.deriveEntities}
						title={store.missingTables.join(', ')}
						class="text-warning-700 hover:underline"
					>
						{plural(store.missingTables.length, 'table', 'tables')} not modeled · Derive
					</button>
				{/if}
				{#if anomalies.length > 0}
					<button
						type="button"
						onclick={() => {
							lens = 'visibility';
							filter = { ...EMPTY_FILTER, visibility: 'anomaly' };
						}}
						title="Left the client experience without a deliberate action, now marked Hidden"
						class="text-warning-700 hover:underline"
					>
						{anomalies.length} hidden without a decision · Show
					</button>
				{/if}
			</span>
		{/if}
	</div>

	<div class="min-h-0 flex-1">
		{#if store.draft.entities.length === 0 && store.draft.hosts.length === 0}
			<div class="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-line text-center">
				<div>
					<p class="text-sm font-semibold text-ink-600">Nothing on the map yet.</p>
					<p class="mt-1 text-xs text-ink-400">Add a table, or a host to place its databases, and the map draws itself.</p>
				</div>
			</div>
		{:else if filtering && result.entityIds.size === 0}
			<div class="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-line text-center">
				<p class="text-sm text-ink-500">No table matches these filters.</p>
			</div>
		{:else}
			<ErdCanvas
				{store}
				{layout}
				{lens}
				{surfaced}
				matchedFieldIds={result.matchedFieldIds}
				{selection}
				{onSelect}
				{links}
				{showInterfaces}
				{fitKey}
				onPlace={place}
			/>
		{/if}
	</div>

	<!-- legend: what the colors say under the current lens, then the marks -->
	<div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-ink-400">
		<span class="font-semibold uppercase tracking-widest">{LENSES.find((l) => l.id === lens)?.label}</span>
		{#if lens === 'database'}
			{#each usedEngines as e (e.code)}
				<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background:{ENGINE_HEX[e.code]}"></span>{e.label}</span>
			{/each}
		{:else if lens === 'host'}
			{#each HOST_KINDS as k (k.code)}
				<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background:{HOST_TYPE_HEX[k.code]}"></span>{k.label}</span>
			{/each}
		{:else if lens === 'origin'}
			{#each ORIGINS as o (o)}
				<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background:{ORIGIN_HEX[o]}"></span>{ORIGIN_LABEL[o]}</span>
			{/each}
		{:else}
			{#each STATUSES as s (s)}
				<span class="flex items-center gap-1"><span class="size-2.5 " style="background:{VISIBILITY_HEX[s]}"></span>{VISIBILITY_LABEL[s]}</span>
			{/each}
		{/if}
		{#if lens !== 'origin' && lens !== 'visibility'}
			<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background:{UNPLACED_HEX}"></span>Not placed</span>
		{/if}
		<span class="text-ink-300">·</span>
		<span><b class="text-warning-700">PK</b> primary key</span>
		<span><b class="text-brand-600">FK</b> points at a table</span>
		<span><b class="text-success-700">UK</b> unique</span>
		<span class="text-ink-300">·</span>
		<CardinalityLegend />
		{#if showInterfaces && usedProtocols.length}
			<span class="text-ink-300">·</span>
			{#each usedProtocols as p (p)}
				<span class="flex items-center gap-1" style="color:{PROTOCOL_HEX[p]}"><span class="inline-block w-3.5 border-t border-dashed" style="border-color:{PROTOCOL_HEX[p]}"></span>{p}</span>
			{/each}
		{/if}
	</div>
</div>
