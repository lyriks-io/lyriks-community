<script lang="ts">
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { EnlargeableDiagram, Icon } from '$ui/design-system';
	import CitedSources from '$ui/documents/CitedSources.svelte';
	import { KICKER } from './type-scale';
	import FindInput from './tech/FindInput.svelte';
	import TableDrawer from './tech/TableDrawer.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import { DataStore } from '$ui/data/draft-store.svelte';
	import CardinalityLegend from '$ui/data/board/CardinalityLegend.svelte';
	import ErdCanvas from '$ui/data/board/ErdCanvas.svelte';
	import ToolbarMenu from '$ui/data/board/ToolbarMenu.svelte';
	import { ENGINE_HEX, HOST_TYPE_HEX } from '$ui/data/infra-style';
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
		type GroupBy,
		type Lens,
		type LinkMode,
		type MapFilter,
		type VisibilityStatus
	} from '$ui/data/board/data-map';
	import type { Selection } from '$ui/data/board/selection';
	import { DB_ENGINES, HOST_KINDS, unrelatedEntities, type EntityOrigin, type MapPlacements, type ProjectDataDraft } from '$domain/data';
	import { sortByName } from '$domain/shared';
	import { MapPlacementsStore } from '$ui/data/board/map-placements.svelte';
	import type { DerivedDataVisibility } from '$application/specification/data-visibility';
	import { narrowTables, type RelationFilter } from '$application/spec360/data-features';
	import { tableUses, type DataPlace } from '$application/spec360/data-map';
	import { BTN, CHIP_ON, FIELD, POP, PRESS_LINE } from './page/look';
	import type { OutlineCore } from '$application/spec360/outline';
	import type { Session } from '$application/ports';

	/**
	 * The data map of the Specification 360°: the interactive map of the
	 * Infrastructure page (tables in their databases, databases on their
	 * machines, every relation), read-only here. Its filters keep what a reader
	 * of the spec asks: the tables a core feature or a feature uses, the
	 * machine, the database, the origin, what reaches a client, the tables
	 * related to none; its view settings group, colour, draw the relations and
	 * show the keys only. The model itself is changed on the Infrastructure page.
	 * On a feature's page it draws the tables that feature uses and those only,
	 * the fields its actions read or write highlighted, with none of the tools
	 * of the whole map (criterion c72a7e79). In the v2 design the map sits in a dotted frame
	 * headed by where the data lives (criterion 0f4c8334), and a selected
	 * table's card opens its details in a drawer (criterion 3750dbba).
	 */
	interface Props {
		data: ProjectDataDraft;
		session: Session;
		derivedVisibility: DerivedDataVisibility;
		/** The tables each feature's states carry. */
		tablesByFeature: Readonly<Record<string, readonly string[]>>;
		cores: readonly OutlineCore[];
		/** Where people put the tables by hand, kept apart from the spec (criterion 7f5769bb). */
		placements: MapPlacements;
		/** Whether the reader may edit the project, and so move its tables. */
		canMove: boolean;
		/** The feature whose tables alone are drawn, on its own page; the map keeps no other scope then. */
		feature?: { readonly id: string; readonly name: string } | null;
		/** On a feature's page, the fields its actions read or write: their rows are highlighted. */
		usedFields?: readonly string[];
		/** Where the data lives, one line per machine at the top of the frame (criterion 0f4c8334); none drawn when absent. */
		places?: readonly DataPlace[] | null;
	}
	let { data, session, derivedVisibility, tablesByFeature, cores, placements: savedPlacements, canMove, feature = null, usedFields = [], places = null }: Props = $props();

	// The tables follow the pointer at once; where they are let go is kept for the project.
	const placements = new MapPlacementsStore(untrack(() => data.projectId), untrack(() => savedPlacements));
	$effect(() => placements.follow(savedPlacements));
	const place = (id: string, x: number, y: number, done: boolean) => {
		placements.move(id, x, y);
		if (done) void placements.drop(id);
	};

	// Read-only: nothing on this page edits the model, so the store never saves.
	const store = untrack(() => new DataStore(data, session, toastNotifier));
	$effect(() => {
		store.draft = data;
	});

	const surfaced = $derived(new Set([...derivedVisibility.entityIds, ...derivedVisibility.fieldIds]));
	const ctx = $derived({ draft: store.draft, derived: surfaced });

	let lens = $state<Lens>('database');
	let filter = $state<MapFilter>({ ...EMPTY_FILTER });
	let chosenScope = $state('');
	const scope = $derived(feature ? `feature:${feature.id}` : chosenScope);
	let relations = $state<RelationFilter>('all');
	let links = $state<LinkMode>('all');
	let keysOnly = $state(false);
	let groupBy = $state<GroupBy>('location');
	let showInterfaces = $state(false);
	let selection = $state<Selection>({ kind: 'none' } as Selection);
	// An address naming a table (a citer of the Sources page) opens the map on it (criterion 3918b2ea).
	$effect(() => {
		const id = page.url.searchParams.get('table');
		if (id && untrack(() => store.draft.entities.some((e) => e.id === id))) selection = { kind: 'table', id };
	});
	// An address naming a database (a database listed under the map) filters the map on its tables (criterion e8a213be).
	$effect(() => {
		const id = page.url.searchParams.get('database');
		if (id && !feature && untrack(() => store.draft.databases.some((d) => d.id === id))) filter = { ...untrack(() => filter), hostId: '', databaseId: id };
	});
	// The address names the database only while the map is filtered on it, so naming it again filters again.
	$effect(() => {
		const named = page.url.searchParams.get('database');
		// An unknown database filters nothing and is left alone (the router may not be ready on a first load).
		if (!named || filter.databaseId === named || !untrack(() => store.draft.databases.some((d) => d.id === named))) return;
		const url = new URL(page.url);
		url.searchParams.delete('database');
		untrack(() => replaceState(url, page.state));
	});
	/** The table selected on the map, whose evidence reads under it. */
	const selectedTable = $derived.by(() => {
		const picked = selection;
		return picked.kind === 'table' ? (store.draft.entities.find((e) => e.id === picked.id) ?? null) : null;
	});
	// Its details open from its card, never on the press that selects or drags it (criterion 3750dbba).
	let detailsOpen = $state(false);
	$effect(() => {
		if (!selectedTable) detailsOpen = false;
	});
	const featureHref = (id: string) => `/projects/${encodeURIComponent(data.projectId)}/spec/features/${encodeURIComponent(id)}`;

	const usedBy = $derived.by((): Set<string> | null => {
		if (!scope) return null;
		const [kind, id] = [scope.slice(0, scope.indexOf(':')), scope.slice(scope.indexOf(':') + 1)];
		const featureIds = kind === 'core' ? (cores.find((c) => c.id === id)?.features.map((f) => f.id) ?? []) : [id];
		return new Set(featureIds.flatMap((f) => tablesByFeature[f] ?? []));
	});
	const unrelated = $derived(new Set(unrelatedEntities(store.draft).map((e) => e.id)));
	const filtering = $derived(isFiltering(filter) || !!scope || relations !== 'all');
	const base = $derived(filterTables(ctx, filter));
	const entityIds = $derived(narrowTables(base.entityIds, { used: usedBy, relations, unrelated }));
	// A feature's few tables are laid out on their own: where people put them on the whole map does not hold there.
	const layout = $derived(layoutMap(store.draft, entityIds, { keepEmpty: !filtering, keysOnly, groupBy, ...(feature ? {} : { placements: placements.doc }) }));
	const fitKey = $derived([...entityIds].sort().join(',') + (keysOnly ? ':keys' : '') + ':' + groupBy);
	// A nested field reads on the row of the field that holds it: a card draws root fields only.
	const usedRows = $derived.by(() => {
		const parent = new Map(store.draft.fields.map((f) => [f.id, f.parentFieldId] as const));
		const rows = new Set<string>();
		for (const id of usedFields) for (let at: string | null | undefined = id; at && !rows.has(at); at = parent.get(at)) rows.add(at);
		return rows;
	});
	// A feature's few tables read at their own size: the frame follows them, up to where a page still holds it.
	const featureHeight = $derived(Math.min(720, Math.max(260, layout.height + 64)));
	// The machines and databases offered from A to Z (criterion 4b3d2b4d).
	const hostOptions = $derived(sortByName(store.draft.hosts, (h) => h.name || 'Host'));
	const dbOptions = $derived(
		sortByName(
			store.draft.databases.filter((d) => !filter.hostId || (filter.hostId === '__none__' ? !d.hostId : d.hostId === filter.hostId)),
			(d) => d.name || 'Untitled database'
		)
	);
	const ORIGINS: EntityOrigin[] = ['journey', 'feature', 'manual'];
	const STATUSES: VisibilityStatus[] = ['visible', 'hidden', 'anomaly'];
	const usedEngines = $derived(DB_ENGINES.filter((e) => store.draft.databases.some((d) => d.engine === e.code)));
	const scopeLabel = $derived.by(() => {
		const [kind, id] = [scope.slice(0, scope.indexOf(':')), scope.slice(scope.indexOf(':') + 1)];
		if (kind === 'core') return cores.find((c) => c.id === id)?.name ?? '';
		return cores.flatMap((c) => c.features).find((f) => f.id === id)?.name ?? '';
	});
	type ChipKey = 'scope' | 'relations' | 'hostId' | 'databaseId' | 'origin' | 'visibility';
	const chips = $derived.by(() => {
		const out: { key: ChipKey; label: string }[] = [];
		if (chosenScope) out.push({ key: 'scope', label: `Used by: ${scopeLabel}` });
		if (relations !== 'all') out.push({ key: 'relations', label: relations === 'related' ? 'Related tables' : 'Related to none' });
		if (filter.hostId) out.push({ key: 'hostId', label: `Machine: ${filter.hostId === '__none__' ? 'none' : store.draft.hosts.find((h) => h.id === filter.hostId)?.name || 'Host'}` });
		if (filter.databaseId) out.push({ key: 'databaseId', label: `Database: ${filter.databaseId === '__none__' ? 'none' : store.draft.databases.find((d) => d.id === filter.databaseId)?.name || 'Untitled'}` });
		if (filter.origin) out.push({ key: 'origin', label: `Origin: ${ORIGIN_LABEL[filter.origin]}` });
		if (filter.visibility) out.push({ key: 'visibility', label: VISIBILITY_LABEL[filter.visibility] });
		return out;
	});
	function clear(key: ChipKey) {
		if (key === 'scope') chosenScope = '';
		else if (key === 'relations') relations = 'all';
		else filter = { ...filter, [key]: '', ...(key === 'hostId' ? { databaseId: '' } : {}) };
	}
	const viewChanges = $derived([groupBy !== 'location', lens !== 'database', links !== 'all', keysOnly, showInterfaces].filter(Boolean).length);
	const LINK_MODES: { id: LinkMode; label: string; title: string }[] = [
		{ id: 'all', label: 'All', title: 'Every relation line' },
		{ id: 'focused', label: 'Focused', title: 'Only the lines of the table you hover or select' },
		{ id: 'off', label: 'Off', title: 'No relation line' }
	];
	const hasFeatureLinks = $derived(Object.keys(tablesByFeature).length > 0);
	const fieldCls = 'grid gap-1';
	// The design's field label (.ly-field label) over its field (.ly-input).
	const fieldLabel = 'font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-ink-3 uppercase';
	const selectCls = `h-8 w-full ${FIELD} px-2 text-xs`;
</script>

<EnlargeableDiagram title={feature ? `Data model · ${feature.name}` : 'Data map'} trigger="top-0 right-0 size-[42px]">
{#snippet children(enlarged)}
<div class="flex flex-col gap-3 {enlarged ? 'h-full' : ''}">
	{#if !feature}
	<!-- Room on the right for the expand icon of the frame: as tall as the search, one gap after View. -->
	<div class="flex flex-wrap items-start gap-2 {enlarged ? '' : 'pr-[50px]'}">
		<FindInput
			bind:value={filter.query}
			placeholder="Find a table or field…"
			class="min-w-[220px] flex-1"
			resultLabel={filtering ? `${entityIds.size} of ${store.draft.entities.length} tables` : null}
		/>
		<span class="flex min-h-[42px] flex-wrap items-center gap-2">
			<ToolbarMenu label="Filters" icon="sliders" size="field" active={chips.length}>
				{#snippet children()}
					<div class="grid w-72 max-w-[calc(100vw-48px)] gap-3 text-xs">
						<label class={fieldCls}>
							<span class={fieldLabel}>Used by</span>
							<select bind:value={chosenScope} class={selectCls} disabled={!hasFeatureLinks} title={hasFeatureLinks ? undefined : 'No field is linked to a feature state yet'}>
								<option value="">Any feature</option>
								{#each cores as core (core.id)}
									<optgroup label={core.name}>
										<option value="core:{core.id}">All of {core.name}</option>
										{#each core.features as f (f.id)}
											<option value="feature:{f.id}">{f.name}</option>
										{/each}
									</optgroup>
								{/each}
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Relations</span>
							<select bind:value={relations} class={selectCls}>
								<option value="all">Every table</option>
								<option value="related">Related to another table</option>
								<option value="unrelated">Related to none</option>
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Machine</span>
							<select bind:value={filter.hostId} onchange={() => (filter.databaseId = '')} class={selectCls}>
								<option value="">All machines</option>
								{#each hostOptions as h (h.id)}<option value={h.id}>{h.name || 'Host'}</option>{/each}
								<option value="__none__">Not on a machine</option>
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Database</span>
							<select bind:value={filter.databaseId} class={selectCls}>
								<option value="">All databases</option>
								{#each dbOptions as d (d.id)}<option value={d.id}>{d.name || 'Untitled database'}</option>{/each}
								<option value="__none__">No database yet</option>
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Origin</span>
							<select bind:value={filter.origin} class={selectCls}>
								<option value="">Any origin</option>
								{#each ORIGINS as o (o)}<option value={o}>{ORIGIN_LABEL[o]}</option>{/each}
							</select>
						</label>
						<label class={fieldCls}>
							<span class={fieldLabel}>Client visibility</span>
							<select bind:value={filter.visibility} class={selectCls}>
								<option value="">Any visibility</option>
								{#each STATUSES as s (s)}<option value={s}>{VISIBILITY_LABEL[s]}</option>{/each}
							</select>
						</label>
					</div>
				{/snippet}
			</ToolbarMenu>
			<ToolbarMenu label="View" icon="eye" size="field" align="right" active={viewChanges}>
				{#snippet children()}
					<div class="grid w-72 max-w-[calc(100vw-48px)] gap-3 text-xs">
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
								{#each LENSES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
							</select>
						</label>
						<div class={fieldCls}>
							<span class={fieldLabel}>Relation lines</span>
							<div class="inline-flex border border-transparent bg-surface p-0.5" role="group" aria-label="Relation lines">
								{#each LINK_MODES as m (m.id)}
									<button
										type="button"
										onclick={() => (links = m.id)}
										aria-pressed={links === m.id}
										title={m.title}
										class="flex-1 px-2 py-1 font-evo-mono font-bold tracking-[0.06em] {links === m.id ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}">{m.label}</button
									>
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
						{#if canMove && placements.count > 0}
							<!-- Every table back where the layout places it (criterion 7f5769bb). -->
							<button
								type="button"
								class="flex items-center gap-2 {PRESS_LINE} px-2 py-1.5 text-left"
								title="Put every table back where the layout places it"
								onclick={() => void placements.arrange()}
								><Icon name="grid" size={13} /> Arrange automatically <span class="font-normal text-ink-400">({placements.count} moved)</span></button
							>
						{/if}
					</div>
				{/snippet}
			</ToolbarMenu>
		</span>
	</div>
	{#if chips.length}
		<div class="flex flex-wrap items-center gap-1.5">
			{#each chips as c (c.key)}
				<button
					type="button"
					onclick={() => clear(c.key)}
					class="inline-flex min-h-8 cursor-pointer items-center gap-1 {CHIP_ON} px-2.5 text-xs"
					title="Remove this filter">{c.label} <Icon name="x" size={11} /></button
				>
			{/each}
		</div>
	{/if}
	{/if}

	<!-- The mockup's dotted frame: where the data lives over the map, the map's own surface made part of it. A feature's page frames the map itself. -->
	<div class="flex flex-col {feature ? '' : 'rounded-evo-card border border-evo-line bg-toner-1 bg-[radial-gradient(circle,var(--color-toner-2)_0.6px,transparent_0.9px)] bg-size-[6px_6px] p-4 max-[760px]:p-2'} {enlarged ? 'min-h-0 flex-1' : ''}">
		{#if places?.length}
			<div class="mb-3 flex flex-col gap-1">
				{#each places as place (place.key)}
					<span class="inline-flex flex-wrap items-center gap-x-2 text-[0.8125rem] font-semibold {place.machine ? 'text-evo-green' : 'text-evo-muted'}">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="1.5"></rect><rect x="3" y="13" width="18" height="7" rx="1.5"></rect><path d="M7 7.5h.01M7 16.5h.01"></path></svg>
						{[place.machine ?? 'Databases', place.detail, place.engines.join(', ')].filter(Boolean).join(' · ')}
					</span>
				{/each}
			</div>
		{/if}
		<div
			class="relative [&_[role=application]]:rounded-[10px] [&_[role=application]]:border-evo-line [&_[role=application]]:bg-white/45 [&_[role=application]]:bg-none! {enlarged ? 'min-h-0 flex-1' : feature ? '' : 'h-[560px] max-[760px]:h-[520px]'}"
			style:height={feature && !enlarged ? `${featureHeight}px` : undefined}
		>
			{#if store.draft.entities.length === 0 && store.draft.hosts.length === 0}
				<div class="grid h-full place-items-center border border-dashed border-evo-control bg-white/60 text-sm text-evo-muted">The data model is not described in the spec yet.</div>
			{:else if filtering && entityIds.size === 0}
				<div class="grid h-full place-items-center border border-dashed border-evo-control bg-white/60 text-sm text-evo-muted">No table matches these filters.</div>
			{:else}
				<ErdCanvas {store} {layout} {lens} {surfaced} matchedFieldIds={feature ? usedRows : base.matchedFieldIds} {selection} onSelect={(s) => (selection = s)} {links} {showInterfaces} {fitKey} readonly onPlace={canMove ? place : null} />
			{/if}
			{#if selectedTable}
				{@const cited = selectedTable.sourceIds ?? []}
				<!-- What the selected table rests on, over the map's corner so nothing moves (criterion 3918b2ea). -->
				<div class="absolute top-3 right-3 z-10 flex max-w-[min(420px,calc(100%-24px))] animate-lk-in-fast flex-col gap-2 rounded-xl {POP} px-3.5 py-3">
					<span class="flex items-start gap-2">
						<span class="{KICKER} min-w-0 flex-1 text-evo-muted">{selectedTable.name || 'Untitled table'} · {cited.length} {cited.length === 1 ? 'SOURCE' : 'SOURCES'}</span>
						<!-- Lets the table go, as Escape and a click on the map's empty space do (criterion 95ccccd8). -->
						<button
							type="button"
							class="-mt-1 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-evo-muted hover:bg-evo-sunken hover:text-evo-ink"
							title="Deselect the table (Esc)"
							aria-label="Deselect {selectedTable.name || 'the table'}"
							onclick={() => (selection = { kind: 'none' })}><Icon name="x" size={14} /></button
						>
					</span>
					{#if cited.length > 0}
						<CitedSources ids={cited} />
					{:else}
						<span class="text-xs text-evo-muted">This table cites no source yet: your LLM cites the code that declares it when it writes the data model.</span>
					{/if}
					<button type="button" class="{BTN} self-start" aria-haspopup="dialog" onclick={() => (detailsOpen = true)}>
						Details
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if !feature}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 font-evo-mono text-[0.6875rem] text-ink-2">
		<span class="font-bold tracking-[0.08em] text-ink-3 uppercase">{LENSES.find((l) => l.id === lens)?.label}</span>
		{#if lens === 'database'}
			{#each usedEngines as e (e.code)}<span class="flex items-center gap-1"><span class="size-2.5" style="background:{ENGINE_HEX[e.code]}"></span>{e.label}</span>{/each}
		{:else if lens === 'host'}
			{#each HOST_KINDS as k (k.code)}<span class="flex items-center gap-1"><span class="size-2.5" style="background:{HOST_TYPE_HEX[k.code]}"></span>{k.label}</span>{/each}
		{:else if lens === 'origin'}
			{#each ORIGINS as o (o)}<span class="flex items-center gap-1"><span class="size-2.5" style="background:{ORIGIN_HEX[o]}"></span>{ORIGIN_LABEL[o]}</span>{/each}
		{:else}
			{#each STATUSES as s (s)}<span class="flex items-center gap-1"><span class="size-2.5" style="background:{VISIBILITY_HEX[s]}"></span>{VISIBILITY_LABEL[s]}</span>{/each}
		{/if}
		{#if lens !== 'origin' && lens !== 'visibility'}<span class="flex items-center gap-1"><span class="size-2.5" style="background:{UNPLACED_HEX}"></span>Not placed</span>{/if}
		<span class="text-evo-faint-2">·</span>
		<span><b class="text-evo-orange">PK</b> primary key</span>
		<span><b class="text-evo-violet-ink">FK</b> points at a table</span>
		<span><b class="text-evo-green">UK</b> unique</span>
		<span class="text-evo-faint-2">·</span>
		<CardinalityLegend />
	</div>
	{/if}
</div>
{/snippet}
</EnlargeableDiagram>
{#if selectedTable}
	<TableDrawer
		open={detailsOpen}
		onClose={() => (detailsOpen = false)}
		table={selectedTable}
		data={store.draft}
		uses={tableUses(selectedTable.id, tablesByFeature, cores)}
		{featureHref}
		onOpenTable={(id) => (selection = { kind: 'table', id })}
	/>
{/if}
