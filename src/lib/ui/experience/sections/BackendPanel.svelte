<script lang="ts">
	import { Icon } from '$ui/design-system';
	import SectionNav, { type SectionNavGroup } from '$ui/shell/SectionNav.svelte';
	import {
		FAKE_FIELD_KINDS,
		generateRows,
		fieldKey,
		sourceEntityOf,
		collectionInSync,
		type FakeFieldKind
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
	}
	let { store }: Props = $props();

	const collections = $derived(store.draft.builder.collections);
	const entities = $derived(store.dataModel.entities);

	// One collection open at a time: the left rail filters, the canvas edits.
	let selectedId = $state<string | null>(null);
	$effect(() => {
		if (collections.length === 0) {
			selectedId = null;
			return;
		}
		if (!selectedId || !collections.some((c) => c.id === selectedId))
			selectedId = collections[0].id;
	});
	const selected = $derived(collections.find((c) => c.id === selectedId) ?? null);
	const preview = $derived(selected ? generateRows(selected).slice(0, 3) : []);

	// Data-model link of the open collection: which entity it descends from,
	// whether re-importing would change anything, or whether the entity is gone.
	const sourceEntity = $derived(selected ? sourceEntityOf(selected, entities) : null);
	const inSync = $derived(
		selected && sourceEntity ? collectionInSync(selected, sourceEntity, store.dataModel.fields) : false
	);
	const modelGone = $derived(!!selected?.sourceEntityId && !sourceEntity);

	const navGroups = $derived<SectionNavGroup[]>([
		{
			label: 'Collections',
			items: collections.map((c) => ({
				id: c.id,
				label: c.name || 'Untitled',
				hint: `${c.fields.length} field${c.fields.length === 1 ? '' : 's'} · ${c.seedCount} seeded row${c.seedCount === 1 ? '' : 's'}`,
				icon: 'database' as const,
				count: c.seedCount
			}))
		}
	]);

	let importId = $state('');
	function importEntity() {
		if (!importId) return;
		const id = store.importEntityAsCollection(importId);
		if (id) selectedId = id;
		importId = '';
	}
	function addCollection() {
		selectedId = store.addCollection();
	}
</script>

{#snippet intro()}
	<p class="text-[11px] leading-snug text-ink-400">
		Collections are the demo data the simulator reads and writes. Bind a
		<span class="font-medium text-ink-600">List</span>
		element to a collection to show its rows, and add a <span class="font-medium text-ink-600">Create record</span>
		flow to a button to append one. Rows are seeded with believable fake data and persist across navigation
		while running.
	</p>
{/snippet}

{#snippet addControls()}
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			onclick={addCollection}
			class="text-[11px] font-semibold text-brand-500 hover:text-brand-600"
		>
			+ Collection
		</button>
		<!-- Import a Step-07 entity as an editable collection (import-once). -->
		<span class="text-[10px] text-ink-300">·</span>
		<label class="flex items-center gap-1.5 text-[10px] text-ink-400">
			<Icon name="database" size={12} />
			<select
				bind:value={importId}
				disabled={entities.length === 0}
				class="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-700 disabled:opacity-50"
			>
				<option value="">{entities.length ? 'Import from data model…' : 'No entities in Data & Architecture'}</option>
				{#each entities as e (e.id)}
					<option value={e.id}>{e.name || 'Untitled entity'}</option>
				{/each}
			</select>
		</label>
		{#if importId}
			<button
				type="button"
				onclick={importEntity}
				class="rounded-field border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600"
			>
				Import
			</button>
		{/if}
		{#if entities.length > 0}
			<span class="text-[10px] text-ink-300">·</span>
			<button
				type="button"
				onclick={() => store.syncCollectionsFromModel()}
				class="flex items-center gap-1 text-[11px] font-semibold text-brand-500 hover:text-brand-600"
				title="Import every entity from Data & Architecture and refresh previously imported collections whose model changed. Seed counts and authored rows are kept."
			>
				<Icon name="rotate" size={11} /> Sync all
			</button>
		{/if}
	</div>
{/snippet}

{#if collections.length === 0}
	<div class="space-y-3 rounded-card border border-dashed border-line px-4 py-8 text-center">
		{@render intro()}
		<div class="flex justify-center">{@render addControls()}</div>
	</div>
{:else}
	<SectionNav
		groups={navGroups}
		active={selectedId ?? ''}
		onSelect={(id) => (selectedId = id)}
	>
		{#snippet footer()}
			{@render addControls()}
		{/snippet}

		{#if selected}
			{@const col = selected}
			<div class="space-y-3">
				{@render intro()}
				<div class="rounded-card border border-line bg-surface p-3">
					<!-- header -->
					<div class="flex items-center gap-2">
						<Icon name="database" size={14} class="shrink-0 text-info-600" />
						<input
							value={col.name}
							oninput={(e) => store.updateCollection(col.id, 'name', e.currentTarget.value)}
							placeholder="Collection name - e.g. Expense"
							class="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-ink-800 outline-none placeholder:font-normal placeholder:text-ink-300"
						/>
						<!-- Data-model link: in sync, drifted (re-syncable), or orphaned. -->
						{#if sourceEntity && !inSync}
							<button
								type="button"
								onclick={() => store.importEntityAsCollection(sourceEntity.id)}
								class="flex shrink-0 items-center gap-1 rounded-pill bg-warning-100 px-2 py-0.5 text-[10px] font-semibold text-warning-600 hover:bg-warning-50"
								title={`The data model changed since this collection was imported. Re-sync name and fields from "${sourceEntity.name}"; seed count and authored rows are kept.`}
							>
								<Icon name="rotate" size={11} /> Re-sync
							</button>
						{:else if sourceEntity}
							<span
								class="flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] text-ink-400"
								title={`In sync with entity "${sourceEntity.name}" in Data & Architecture.`}
							>
								<Icon name="link" size={11} /> Model
							</span>
						{:else if modelGone}
							<span
								class="flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] text-ink-400"
								title="The entity this collection was imported from no longer exists in the data model. The collection lives on as demo-only data."
							>
								<Icon name="circle-alert" size={11} /> No entity
							</span>
						{/if}
						<label class="flex shrink-0 items-center gap-1 text-[10px] text-ink-400">
							Seed
							<input
								type="number"
								min="0"
								max="50"
								value={col.seedCount}
								oninput={(e) => store.updateCollection(col.id, 'seedCount', Number(e.currentTarget.value))}
								class="w-12 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700 outline-none"
							/>
						</label>
						<button
							type="button"
							onclick={() => store.removeCollection(col.id)}
							class="shrink-0 text-ink-300 hover:text-danger-500"
							title="Delete collection"><Icon name="x" size={14} /></button
						>
					</div>

					<!-- fields -->
					<div class="mt-2 space-y-1">
						{#each col.fields as f (f.id)}
							<div class="flex items-center gap-1.5">
								<input
									value={f.name}
									oninput={(e) => store.updateCollectionField(col.id, f.id, { name: e.currentTarget.value })}
									placeholder="Field name"
									class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-700 outline-none"
								/>
								<select
									value={f.kind}
									onchange={(e) =>
										store.updateCollectionField(col.id, f.id, {
											kind: e.currentTarget.value as FakeFieldKind
										})}
									class="shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink-700"
								>
									{#each FAKE_FIELD_KINDS as k (k.code)}<option value={k.code}>{k.label}</option>{/each}
								</select>
								<button
									type="button"
									onclick={() => store.removeCollectionField(col.id, f.id)}
									class="shrink-0 text-ink-300 hover:text-danger-500"><Icon name="x" size={12} /></button
								>
							</div>
						{/each}
						<button
							type="button"
							onclick={() => store.addCollectionField(col.id)}
							class="text-[10px] font-semibold text-brand-500 hover:text-brand-600">+ Field</button
						>
					</div>

					<!-- preview -->
					{#if preview.length > 0}
						<div class="mt-2 rounded border border-line bg-surface-sunken/40 p-1.5">
							<p class="mb-1 text-[9px] font-semibold uppercase tracking-wider text-ink-300">Sample rows</p>
							{#each preview as row, i (i)}
								<p class="truncate text-[10px] text-ink-500">
									{col.fields.map((f) => row[fieldKey(f)]).join(' · ')}
								</p>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</SectionNav>
{/if}
