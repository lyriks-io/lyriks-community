<script lang="ts">
	import { Button, Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		journeysUnderCore,
		stepsOfJourney,
		type DerivedCore,
		type Journey
	} from '$domain/experience';
	import { coreToneStyle } from '$ui/features/core-colors';
	import type { ExperienceStore } from '../draft-store.svelte';
	import StepEditor from './StepEditor.svelte';

	interface Role {
		id: string;
		name: string;
	}
	interface Props {
		store: ExperienceStore;
		roles: Role[];
	}
	let { store, roles }: Props = $props();

	const cores = $derived<DerivedCore[]>(
		[...store.draft.derivedCores].sort((a, b) => a.order - b.order)
	);
	const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;

	const selected = $derived<Journey | null>(
		store.draft.journeys.find((j) => j.id === store.selectedJourneyId) ?? null
	);
	const selectedSteps = $derived(selected ? stepsOfJourney(store.draft, selected.id) : []);
	const selectedCore = $derived(
		selected ? (cores.find((c) => c.id === selected.coreId) ?? null) : null
	);

	// Journeys whose Core was deleted upstream in Step 04 — re-home or drop.
	const orphanJourneys = $derived.by<Journey[]>(() => {
		const coreIds = new Set(store.draft.derivedCores.map((c) => c.id));
		return store.draft.journeys.filter((j) => !coreIds.has(j.coreId));
	});

	let refreshing = $state(false);
	async function refresh() {
		refreshing = true;
		await store.refreshCores();
		refreshing = false;
	}

	const screenName = (id: string | null) =>
		id ? (store.draft.screens.find((s) => s.id === id)?.name || 'Untitled screen') : '';

	/* Search over the macro flow. A journey matches on its own name/goal, on its
	   actors, or on the text of one of its steps, because "where does the user
	   confirm the payment?" is a question about a step, not a journey title. A
	   core whose name matches keeps all of its journeys, and a core left with
	   none drops out of the strip. */
	let search = $state('');
	const searching = $derived(search.trim().length > 0);
	const journeyMatches = (journey: Journey): boolean =>
		matchesQuery(
			search,
			journey.name,
			journey.description,
			...journey.actorRoleIds.map(roleName),
			...stepsOfJourney(store.draft, journey.id).map((st) => st.name),
			...stepsOfJourney(store.draft, journey.id).map((st) => screenName(st.linkedScreenId))
		);
	/** The journeys of a core to show: all of them when the core itself matched. */
	function visibleJourneys(core: DerivedCore): Journey[] {
		const list = journeysUnderCore(store.draft, core.id);
		if (!searching || matchesQuery(search, core.name)) return list;
		return list.filter(journeyMatches);
	}
	const visibleCores = $derived(
		searching ? cores.filter((c) => visibleJourneys(c).length > 0) : cores
	);
	const visibleOrphans = $derived(
		searching ? orphanJourneys.filter(journeyMatches) : orphanJourneys
	);
</script>

<div class="space-y-5">
	<!-- Macro flow ───────────────────────────────────────────────────── -->
	<section class="space-y-3">
		<div class="flex items-center justify-between gap-3">
			<div>
				<h2 class="text-sm font-semibold text-ink-900">
					Macro flow ·
					<span class="text-ink-500">
						{cores.length} core{cores.length === 1 ? '' : 's'} · {store.draft.journeys.length}
						journey{store.draft.journeys.length === 1 ? '' : 's'}
					</span>
				</h2>
				<p class="text-xs text-ink-400">Macro stages mirror the cores from Features & Prioritization.</p>
			</div>
			<SearchInput
				bind:value={search}
				placeholder="Search a journey, actor or step…"
				class="ml-auto w-full max-w-xs"
			/>
			<button
				type="button"
				onclick={refresh}
				disabled={refreshing}
				class="flex shrink-0 items-center gap-1.5 rounded-field border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-700 disabled:opacity-50"
				title="Re-pull the read-only Cores from the Features section"
			>
				<Icon name="rotate" size={13} />
				{refreshing ? 'Refreshing…' : 'Refresh cores'}
			</button>
		</div>

		{#if cores.length === 0}
			<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
				<p class="text-sm font-semibold text-ink-700">No cores to map journeys onto yet.</p>
				<p class="mt-1 text-xs text-ink-500">
					Macro stages mirror the cores from the Features section. Author at least one core there, then come back
					to lay journeys over it.
				</p>
			</div>
		{:else if visibleCores.length === 0}
			<p class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-8 text-center text-sm text-ink-500">
				No journey matches the search.
			</p>
		{:else}
			<div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
				{#each visibleCores as core, i (core.id)}
					{@const journeys = visibleJourneys(core)}
					{@const style = coreToneStyle(core.tone, i)}
					<div class="flex w-[260px] shrink-0 flex-col rounded-card border {style.card}">
						<header class="flex items-center gap-2 rounded-t-card border-b border-white/60 bg-white/55 px-3 py-2.5">
							<span class="grid size-6 place-items-center rounded-md text-[11px] font-bold {style.icon}">
								{core.order + 1}
							</span>
							<h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{core.name}</h3>
							<span class="rounded-pill px-1.5 py-0.5 text-[10px] font-semibold {style.soft}">
								{journeys.length}
							</span>
						</header>
						<div class="flex flex-1 flex-col gap-1.5 p-2">
							{#each journeys as journey (journey.id)}
								{@const isSel = store.selectedJourneyId === journey.id}
								{@const steps = stepsOfJourney(store.draft, journey.id)}
								<button
									type="button"
									data-anchor={journey.id}
									onclick={() => store.selectJourney(journey.id)}
									class="rounded-lg border p-2 text-left transition-colors {isSel
										? style.selected
										: 'border-white/70 bg-white/70 hover:bg-white'}"
								>
									<p class="truncate text-xs font-semibold text-ink-900">
										{journey.name || 'Untitled journey'}
									</p>
									<p class="mt-0.5 text-[10px] text-ink-400">
										{steps.length} step{steps.length === 1 ? '' : 's'}
										{#if journey.actorRoleIds.length > 0}
											· {journey.actorRoleIds.map(roleName).join(', ')}
										{/if}
									</p>
								</button>
							{/each}
							<button
								type="button"
								onclick={() => store.addJourney(core.id)}
								class="rounded-lg border border-dashed border-white/80 px-2 py-1.5 text-[11px] font-semibold transition-colors {style.text} hover:border-current"
							>
								+ Journey
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Selected journey detail ──────────────────────────────────────── -->
	{#if selected}
		{@const selectedStyle = selectedCore ? coreToneStyle(selectedCore.tone, selectedCore.order) : null}
		<section class="rounded-card border border-line bg-surface">
			<header class="flex items-start gap-3 border-b border-line px-4 py-3">
				<span class="mt-0.5 grid size-7 place-items-center rounded-lg {selectedStyle?.soft ?? 'bg-brand-50 text-brand-600'}">
					<Icon name="arrow-right" size={14} />
				</span>
				<div class="min-w-0 flex-1 space-y-1.5">
					<input
						value={selected.name}
						oninput={(e) => store.updateJourney(selected.id, 'name', e.currentTarget.value)}
						placeholder="Journey name - e.g. Recover an overdue invoice"
						class="w-full border-none bg-transparent text-base font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
					/>
					<input
						value={selected.description}
						oninput={(e) => store.updateJourney(selected.id, 'description', e.currentTarget.value)}
						placeholder="One-line goal (optional)"
						class="w-full border-none bg-transparent text-xs text-ink-500 outline-none placeholder:text-ink-300"
					/>
					<!-- actor roles -->
					<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
						<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Actors</span>
						{#if roles.length === 0}
							<span class="text-[11px] text-ink-300">Author roles in Users &amp; Permissions</span>
						{:else}
							{#each roles as role (role.id)}
								{@const on = selected.actorRoleIds.includes(role.id)}
								<button
									type="button"
									onclick={() => store.toggleActorRole(selected.id, role.id)}
									class="rounded-pill border px-2 py-0.5 text-[10px] font-medium transition-colors {on
										? (selectedStyle?.selected ?? 'border-brand-300 bg-brand-50 text-brand-600')
										: 'border-line bg-surface text-ink-400 hover:text-ink-700'}"
								>
									{role.name || 'role'}
								</button>
							{/each}
						{/if}
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-1">
					{#if selectedCore}
						<span class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {selectedStyle?.soft ?? 'bg-surface-sunken text-ink-400'}">
							{selectedCore.name}
						</span>
					{/if}
					<button
						type="button"
						onclick={() => store.selectJourney(selected.id)}
						class="rounded-field border border-line px-2 py-1 text-[11px] text-ink-400 hover:text-ink-700"
					>
						Close
					</button>
				</div>
			</header>

			<!-- Happy-flow step strip -->
			<div class="overflow-x-auto px-4 py-4">
				<div class="flex items-stretch gap-1.5">
					{#each selectedSteps as step, i (step.id)}
						<div
							data-anchor={step.id}
							class="flex w-[200px] shrink-0 flex-col rounded-xl border border-line bg-surface p-2.5"
						>
							<div class="mb-1 flex items-center gap-1.5">
								<span class="grid h-5 min-w-[1.25rem] place-items-center rounded bg-brand-50 px-1 text-[10px] font-bold text-brand-600">
									{i + 1}
								</span>
								<div class="ml-auto flex items-center gap-0.5">
									<button
										type="button"
										onclick={() => store.reorderStep(step.id, 'up')}
										disabled={i === 0}
										class="text-ink-300 hover:text-ink-700 disabled:opacity-30"
										title="Move left"><Icon name="chevron-left" size={13} /></button
									>
									<button
										type="button"
										onclick={() => store.reorderStep(step.id, 'down')}
										disabled={i === selectedSteps.length - 1}
										class="text-ink-300 hover:text-ink-700 disabled:opacity-30"
										title="Move right"><Icon name="chevron-right" size={13} /></button
									>
									<button
										type="button"
										onclick={() => store.removeStep(step.id)}
										class="text-ink-300 hover:text-danger-500"
										title="Remove step"><Icon name="x" size={13} /></button
									>
								</div>
							</div>
							<!-- screen link -->
							<select
								value={step.linkedScreenId ?? ''}
								onchange={(e) =>
									e.currentTarget.value
										? store.linkScreen(step.id, e.currentTarget.value)
										: store.unlinkScreen(step.id)}
								class="mb-1.5 w-full truncate rounded border border-line bg-surface-sunken px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600 outline-none"
								title={screenName(step.linkedScreenId) || 'Pick screen'}
							>
								<option value="">Pick screen…</option>
								{#each store.draft.screens as s (s.id)}
									<option value={s.id}>{s.name || 'Untitled screen'}</option>
								{/each}
							</select>
							<input
								value={step.name}
								oninput={(e) => store.updateStep(step.id, 'name', e.currentTarget.value)}
								placeholder="Step / action…"
								class="w-full rounded border border-line bg-surface px-1.5 py-1 text-xs font-medium text-ink-900 outline-none focus:border-brand-300 placeholder:text-ink-300"
							/>
						</div>
						{#if i < selectedSteps.length - 1}
							<div class="flex shrink-0 items-center text-ink-300">
								<Icon name="arrow-right" size={16} />
							</div>
						{/if}
					{/each}
					<button
						type="button"
						onclick={() => store.addStep(selected.id)}
						class="flex w-[120px] shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-xs font-semibold text-ink-400 transition-colors hover:border-brand-300 hover:text-brand-600"
					>
						+ Step
					</button>
				</div>
			</div>

			<!-- Invisible underlays (Events Flow / Data Consumed) -->
			<div class="border-t border-line px-4 py-3">
				<div class="mb-2 flex items-center justify-between">
					<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						Behind the steps · Events Flow & Data Consumed
					</p>
					<button
						type="button"
						onclick={store.toggleInvisible}
						class="flex items-center gap-1.5 rounded-field border px-2.5 py-1 text-[11px] font-semibold transition-colors {store.showInvisible
							? 'border-brand-300 bg-brand-50 text-brand-600'
							: 'border-line bg-surface-sunken text-ink-500 hover:text-ink-700'}"
					>
						<Icon name={store.showInvisible ? 'info' : 'search'} size={12} />
						{store.showInvisible ? 'Invisible: shown' : 'Visible only'}
					</button>
				</div>
				{#if store.showInvisible}
					<div class="rounded-card bg-surface-sunken/40 p-3">
						<StepEditor {store} journeyId={selected.id} steps={selectedSteps} />
					</div>
				{/if}
			</div>
		</section>
	{:else if cores.length > 0}
		<p class="rounded-card border border-dashed border-line px-4 py-6 text-center text-xs text-ink-400">
			Pick a journey above to map its steps.
		</p>
	{/if}

	<!-- Orphaned journeys safety net -->
	{#if visibleOrphans.length > 0}
		<section class="rounded-card border border-warning-300 bg-warning-50/40">
			<header class="flex items-center gap-2.5 border-b border-warning-200 px-4 py-3">
				<span class="grid size-7 place-items-center rounded-lg bg-warning-100 text-warning-600">
					<Icon name="info" size={14} />
				</span>
				<div>
					<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-warning-600">
						Unassigned · core removed in Features
					</p>
					<h3 class="text-sm font-semibold text-ink-900">
						{visibleOrphans.length} orphaned journey{visibleOrphans.length === 1 ? '' : 's'}
					</h3>
				</div>
			</header>
			<ul class="divide-y divide-warning-200">
				{#each visibleOrphans as journey (journey.id)}
					<li class="flex items-center gap-3 px-4 py-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-ink-800">
								{journey.name || '<unnamed journey>'}
							</p>
							<p class="text-[11px] text-ink-400">Re-home it to a current core, or remove it.</p>
						</div>
						<select
							value=""
							onchange={(e) => {
								if (e.currentTarget.value)
									store.updateJourney(journey.id, 'coreId', e.currentTarget.value);
							}}
							class="rounded-field border border-line bg-surface px-2 py-1 text-xs text-ink-600"
						>
							<option value="">Move to core…</option>
							{#each cores as c (c.id)}
								<option value={c.id}>{c.name}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={() => store.removeJourney(journey.id)}
							class="text-ink-300 hover:text-danger-500"
							title="Remove journey"><Icon name="x" size={15} /></button
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
