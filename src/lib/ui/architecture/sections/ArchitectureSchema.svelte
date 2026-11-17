<script lang="ts">
	import { FilterBar, Icon, createFilter } from '$ui/design-system';
	import {
		architectureStage,
		ARCH_LAYERS,
		techByRepository,
		type ArchLayer,
		type TechChoice
	} from '$domain/architecture';
	import { getDocumentRegistry } from '$ui/documents/registry.svelte';
	import SourceLink from '$ui/documents/SourceLink.svelte';
	import type { ArchitectureStore } from '../draft-store.svelte';

	interface Props {
		store: ArchitectureStore;
	}
	let { store }: Props = $props();

	// The project evidence register — a tech choice points at one of its rows.
	const registry = getDocumentRegistry();
	const sources = $derived(registry?.sources ?? []);
	const documentsHref = $derived(registry?.documentsHref ?? '');
	const logical = $derived(architectureStage(store.draft) === 'logical');

	// The stack declared in Foundation & Data is taken in on its own, on open and
	// whenever it changes upstream: no button. Additive only, and a card the
	// author removed stays removed (see `takeInUpstreamStack`).
	$effect(() => {
		if (store.missingTech.length > 0) store.takeInUpstreamStack();
	});

	const allGroups = $derived(techByRepository(store.draft));
	const repositories = $derived(allGroups.map((g) => g.repository).filter(Boolean));

	// The same toolbar as every other list: the search box, then one Filters
	// menu with the repository, the layer and the documentation state
	// (spec: feat-stack-constraints, action 457997ef). It only hides cards.
	const filter = createFilter<TechChoice>({
		fields: (t) => [t.name, t.role, t.repository],
		placeholder: 'Search the stack…',
		noun: 'choices',
		facets: [
			{
				key: 'repository',
				label: 'Repository',
				value: (t) => t.repository?.trim() || null,
				noneLabel: 'Not tied to a repository'
			},
			{
				key: 'layer',
				label: 'Layer',
				value: (t) => t.layer,
				options: ARCH_LAYERS.map((l) => ({ value: l.code, label: l.label }))
			},
			{
				key: 'documentation',
				label: 'Documentation',
				value: (t) => (t.referenceDocId ? 'referenced' : 'missing'),
				options: [
					{ value: 'referenced', label: 'Points at its docs' },
					{ value: 'missing', label: 'No docs yet' }
				]
			}
		]
	});
	const shownCount = $derived(store.draft.techChoices.filter(filter.matches).length);
	// While narrowing, a repository with no card left is hidden; otherwise every
	// repository shows, an empty one included, so a choice can be added to it.
	const groups = $derived(
		allGroups
			.map((g) => ({ ...g, techChoices: g.techChoices.filter(filter.matches) }))
			.filter((g) => !filter.active || g.techChoices.length > 0)
	);
	let newLayer = $state<ArchLayer>('backend');
	// One generic example fits no layer — each placeholder shows a tech and a
	// role that actually belong to its column.
	const layerExample: Record<ArchLayer, { name: string; role: string }> = {
		frontend: { name: 'e.g. React 19', role: 'role, e.g. UI framework' },
		backend: { name: 'e.g. Node 22', role: 'role, e.g. Type-safe API' },
		data: { name: 'e.g. PostgreSQL 16', role: 'role, e.g. primary database' },
		integrations: { name: 'e.g. Stripe API', role: 'role, e.g. payments' },
		infra: { name: 'e.g. Docker', role: 'role, e.g. container runtime' }
	};
	// Inputs read as text until hovered or focused; an empty one shows its
	// placeholder in grey, which is enough to see what is left to fill.
	const fillableInput =
		'min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none transition-colors hover:border-line focus:border-brand-400 focus:bg-surface placeholder:text-ink-300';
	// One line per choice: name, role, repository, docs, remove. Below the
	// container's 2xl width the line wraps into two (see the markup).
	const ROW_COLS = '@2xl:grid-cols-[minmax(140px,1fr)_minmax(180px,1.6fr)_minmax(110px,0.8fr)_minmax(150px,1fr)_20px]';

	const docFor = (id: string | null) =>
		id ? (sources.find((source) => source.id === id) ?? null) : null;


	/** Citing a tech's official docs also cites it for the section as a whole. */
	function onRefChange(techId: string, sourceId: string) {
		store.linkTechToDoc(techId, sourceId || null);
		if (sourceId && !store.draft.sourceIds.includes(sourceId)) store.toggleSource(sourceId);
	}
</script>

<section class="space-y-4">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<p class="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-widest text-brand-400">
			<Icon name="layers" size={14} /> Stack
		</p>
		<label class="flex items-center gap-2 text-xs text-ink-600">
			Stage
			<select
				aria-label="Stack stage"
				value={logical ? 'logical' : 'implementation'}
				onchange={(e) => store.setStage(e.currentTarget.value as 'logical' | 'implementation')}
				class="rounded-field border border-line bg-surface px-2 py-1"
			>
				<option value="logical">Logical design</option>
				<option value="implementation">Implementation decisions</option>
			</select>
		</label>
	</header>

	{#if store.draft.techChoices.length > 0}
		<FilterBar {filter} items={store.draft.techChoices} visibleCount={shownCount} size="md" />
	{/if}

	<datalist id="arch-repositories">
		{#each repositories as repository (repository)}
			<option value={repository}></option>
		{/each}
	</datalist>

	{#each groups as group (group.repository)}
		{@const techs = group.techChoices}
		<!-- A repository: one white card, its choices one per line under a grey
		     heading per layer. No tint per layer: the heading says the layer. -->
		<div class="@container rounded-card border border-line bg-surface">
			<div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
				<p class="flex min-w-0 items-center gap-2 text-ink-500">
					<Icon name="file" size={14} />
					{#if group.repository}
						<span class="truncate font-mono text-sm font-semibold text-ink-900">{group.repository}</span>
					{:else}
						<span class="truncate text-sm font-medium">Not tied to a repository yet</span>
					{/if}
				</p>
				<span class="shrink-0 text-[0.6875rem] text-ink-400">
					{techs.length} {logical ? 'component' : 'choice'}{techs.length === 1 ? '' : 's'}
				</span>
			</div>
			{#each ARCH_LAYERS as layer (layer.code)}
				{@const layerTechs = techs.filter((t) => t.layer === layer.code)}
				{#if layerTechs.length > 0 || !filter.active}
					<div class="border-b border-line px-4 py-2.5 last:border-b-0">
						<div class="mb-1 flex items-center justify-between">
							<h3 class="text-[0.9375rem] font-bold text-ink-900">{layer.label}</h3>
							<button
								type="button"
								onclick={() => store.addTech(layer.code, { repository: group.repository })}
								class="flex items-center gap-1 text-[0.6875rem] font-medium text-ink-400 transition hover:text-brand-600"
							>
								<Icon name="plus" size={11} /> {logical ? 'Component' : 'Choice'}
							</button>
						</div>
						{#each layerTechs as tech (tech.id)}
							{@const doc = docFor(tech.referenceDocId)}
							<div
								data-anchor={tech.id}
								class="group/tech grid items-center gap-x-2 rounded-md text-sm hover:bg-surface-sunken/50 {ROW_COLS}"
							>
								<input
									value={tech.name}
									oninput={(e) => store.updateTech(tech.id, 'name', e.currentTarget.value)}
									placeholder={logical ? 'Component name' : layerExample[tech.layer].name}
									aria-label="Name"
									title={tech.name}
									class="{fillableInput} font-medium text-ink-900 placeholder:font-normal"
								/>
								<input
									value={tech.role}
									oninput={(e) => store.updateTech(tech.id, 'role', e.currentTarget.value)}
									placeholder={logical ? 'Responsibility and boundary' : layerExample[tech.layer].role}
									aria-label="Role"
									title={tech.role}
									class="{fillableInput} text-[0.8125rem] text-ink-600"
								/>
								<input
									list="arch-repositories"
									value={tech.repository ?? ''}
									onchange={(e) => store.updateTech(tech.id, 'repository', e.currentTarget.value.trim())}
									placeholder="repository"
									aria-label="Repository"
									class="{fillableInput} font-mono text-xs text-ink-600"
								/>
								<!-- The docs: the source's title, linked, or a short amber
								     "No docs". The picker sits over it, invisible until used. -->
								<span class="relative flex min-w-0 items-center gap-1.5 text-xs">
									{#if doc}
										<SourceLink source={doc} class="relative z-10 flex min-w-0 items-center gap-1 truncate font-medium text-brand-600 hover:underline" />
									{:else}
										<span class="flex items-center gap-1 font-medium text-warning-600">
											<Icon name="circle-alert" size={12} /> No docs
										</span>
									{/if}
									<label class="relative ml-auto flex shrink-0 items-center text-ink-300 opacity-0 transition group-hover/tech:opacity-100 focus-within:opacity-100 hover:text-ink-600" title="Choose its documentation">
										<Icon name="chevron-down" size={13} />
										<select
											value={tech.referenceDocId ?? ''}
											onchange={(e) => onRefChange(tech.id, e.currentTarget.value)}
											aria-label="Documentation of {tech.name || 'this choice'}"
											class="absolute inset-0 cursor-pointer opacity-0"
										>
											<option value="">No reference</option>
											{#each sources as source (source.id)}
												<option value={source.id}>{source.title || source.url || 'untitled source'}</option>
											{/each}
										</select>
									</label>
									<a
										href={documentsHref}
										title="Register a new source"
										aria-label="Register a new source"
										class="shrink-0 text-ink-300 opacity-0 transition group-hover/tech:opacity-100 focus:opacity-100 hover:text-brand-600"
										><Icon name="plus" size={13} /></a
									>
								</span>
								<button
									type="button"
									aria-label="Remove {tech.name || 'this choice'}"
									onclick={() => store.removeTech(tech.id)}
									class="justify-self-end text-ink-300 opacity-0 transition group-hover/tech:opacity-100 hover:text-danger-500 focus:opacity-100"
									><Icon name="x" size={13} /></button
								>
							</div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<div class="rounded-card border border-dashed border-line px-5 py-8 text-center text-sm text-ink-500">
			{#if filter.active}
				No {logical ? 'component' : 'choice'} matches.
				<button type="button" onclick={() => filter.clear()} class="font-medium text-brand-600 hover:underline">Clear the filters</button>
			{:else}
				No {logical ? 'component' : 'technology'} yet.
			{/if}
		</div>
	{/each}

	<div class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
		<span>New choices go in</span>
		<select
			aria-label="Layer for new choices"
			bind:value={newLayer}
			class="rounded-field border border-line bg-surface px-2 py-1 text-ink-700"
		>
			{#each ARCH_LAYERS as layer (layer.code)}
				<option value={layer.code}>{layer.label}</option>
			{/each}
		</select>
		<button
			type="button"
			onclick={() => store.addTech(newLayer)}
			class="inline-flex items-center gap-1 rounded-field border border-line bg-surface px-2 py-1 font-medium text-ink-700 hover:border-brand-300 hover:text-brand-600"
		>
			<Icon name="plus" size={12} /> {logical ? 'Component' : 'Choice'} not tied to a repository
		</button>
	</div>
</section>
