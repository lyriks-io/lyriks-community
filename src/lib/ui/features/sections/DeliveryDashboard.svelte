<script lang="ts">
	import { untrack } from 'svelte';
	import { Icon } from '$ui/design-system';
	import type { Collaborator } from '$domain/team/team';
	import type { FeatureActionIndex } from '$application/index-feature-actions';
	import { colorTokens, disciplineLabel, initials, shortName } from '$ui/team/team-style';
	import { assignedItemsFor } from '../assigned-items';
	import type { FeaturesStore } from '../draft-store.svelte';

	interface Props {
		store: FeaturesStore;
		/** The project team. */
		collaborators: Collaborator[];
		/** Action names per feature, to label action items. */
		featureActions: FeatureActionIndex;
	}
	let { store, collaborators, featureActions }: Props = $props();

	// Multi-select of contributors — start with everyone selected so the board
	// shows the whole delivery load; narrow down by toggling people off.
	let selected = $state<Set<string>>(new Set(untrack(() => collaborators).map((c) => c.id)));
	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	const allOn = $derived(collaborators.length > 0 && collaborators.every((c) => selected.has(c.id)));
	function setAll(on: boolean) {
		selected = on ? new Set(collaborators.map((c) => c.id)) : new Set();
	}

	const features = $derived(store.draft.features);
	const featureName = (id: string | undefined) =>
		features.find((f) => f.id === id)?.name || 'Untitled feature';

	const rows = $derived(
		collaborators
			.filter((c) => selected.has(c.id))
			.map((c) => ({ c, items: assignedItemsFor(store.draft, featureActions, c.id) }))
	);
	const totalItems = $derived(rows.reduce((n, r) => n + r.items.length, 0));

	function openItem(featureId: string) {
		store.switchTab('tree');
		store.selectFeature(featureId);
	}
</script>

<div class="space-y-4">
	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="rounded-card border border-line bg-surface p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Delivery</p>
				<p class="mt-0.5 max-w-xl text-sm text-ink-500">
					Pick one or more contributors and see every feature and action assigned to them, as its
					owner or as a contributor.
				</p>
			</div>
			<div class="rounded-field bg-surface-sunken px-3 py-1.5 text-center">
				<p class="text-lg font-bold leading-none text-ink-900">{totalItems}</p>
				<p class="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Items</p>
			</div>
		</div>
	</div>

	<!-- ── Contributor multi-select ───────────────────────────────────────── -->
	<div class="rounded-card border border-line bg-surface p-3">
		<div class="mb-2 flex items-center justify-between">
			<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
				Contributors · {selected.size}/{collaborators.length}
			</p>
			<div class="flex items-center gap-1 text-[11px] font-medium">
				<button type="button" onclick={() => setAll(true)} class="rounded px-1.5 py-0.5 text-brand-600 hover:bg-surface-sunken">All</button>
				<button type="button" onclick={() => setAll(false)} class="rounded px-1.5 py-0.5 text-ink-400 hover:bg-surface-sunken">None</button>
			</div>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each collaborators as c (c.id)}
				{@const on = selected.has(c.id)}
				<button
					type="button"
					onclick={() => toggle(c.id)}
					aria-pressed={on}
					class="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] transition {on
						? 'border-brand-300 bg-brand-50/70'
						: 'border-line bg-surface opacity-60 hover:opacity-100'}"
				>
					<span
						class="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
						style="background:{colorTokens(c.color).solid}"
					>
						{initials(c.name || c.email)}
					</span>
					<span class="font-semibold text-ink-800">{shortName(c)}</span>
					<span class="text-[9px] font-medium uppercase tracking-wide text-ink-400">{disciplineLabel(c)}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- ── Per-contributor queues ─────────────────────────────────────────── -->
	{#if rows.length === 0}
		<p class="rounded-card border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-400">
			Select at least one contributor to see their delivery load.
		</p>
	{:else}
		<div class="grid gap-3 @2xl:grid-cols-2">
			{#each rows as row (row.c.id)}
				<div class="rounded-card border border-line bg-surface">
					<div class="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
						<span
							class="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
							style="background:{colorTokens(row.c.color).solid}"
						>
							{initials(row.c.name || row.c.email)}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[13px] font-semibold text-ink-900">{shortName(row.c)}</span>
							<span class="block text-[10px] font-medium uppercase tracking-wide text-ink-400">
								{disciplineLabel(row.c)}
							</span>
						</span>
						<span class="shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-600">
							{row.items.length}
						</span>
					</div>
					{#if row.items.length === 0}
						<p class="px-3 py-3 text-[11px] text-ink-400">Nothing assigned.</p>
					{:else}
						<div class="divide-y divide-line/60">
							{#each row.items as item (item.key)}
								<button
									type="button"
									onclick={() => openItem(item.featureId)}
									class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-sunken"
								>
									<Icon
										name={item.kind === 'feature' ? 'grid' : 'cpu'}
										size={12}
										class="shrink-0 {item.kind === 'feature' ? 'text-brand-500' : 'text-ink-400'}"
									/>
									<span class="min-w-0 flex-1 truncate text-[12px] {item.kind === 'feature'
										? 'font-medium text-ink-800'
										: 'text-ink-700'}">
										{item.name}
										{#if item.kind === 'action'}
											<span class="text-[10px] text-ink-400">· {featureName(item.featureId)}</span>
										{/if}
									</span>
									<span
										class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {item.relation ===
										'Owner'
											? 'bg-brand-50 text-brand-600'
											: 'bg-surface-sunken text-ink-500'}"
									>
										{item.relation}
									</span>
									{#if item.core}
										<span class="hidden shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-500 @sm:inline">
											{item.core}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
