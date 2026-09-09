<script lang="ts" generics="T">
	import Icon from './Icon.svelte';
	import SearchInput from './SearchInput.svelte';
	import type { FacetDef, Filter } from './filter.svelte';

	/**
	 * The toolbar for a `Filter`: the shared search box plus whatever facets the
	 * page declared, in one consistent row. A page never renders facet controls
	 * itself, so no two lists disagree about what a filter chip looks like or
	 * where "Clear" sits.
	 *
	 * `items` is the UNFILTERED list. The bar needs it to derive the options of
	 * facets that did not declare any, and to show how many rows each option
	 * would keep.
	 */
	interface Props {
		filter: Filter<T>;
		/** The full list, before filtering. */
		items: readonly T[];
		/** How many survive; renders the "n of m" readout. */
		visibleCount?: number;
		/** `md` for a page-level toolbar, `sm` inside a card. */
		size?: 'sm' | 'md';
		class?: string;
	}
	let { filter, items, visibleCount, size = 'sm', class: klass = '' }: Props = $props();

	const kindOf = (facet: FacetDef<T>) => facet.kind ?? 'pills';
	const total = $derived(items.length);
	const shown = $derived(visibleCount ?? total);
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-2 {klass}">
	<SearchInput
		bind:value={filter.query}
		placeholder={filter.placeholder}
		{size}
		class="w-full max-w-xs"
	/>

	{#each filter.facets as facet (facet.key)}
		{@const options = filter.optionsFor(facet, items)}
		{#if options.length > 0}
			{#if kindOf(facet) === 'toggle'}
				<button
					type="button"
					onclick={() => filter.toggle(facet.key, 'on')}
					aria-pressed={filter.isSelected(facet.key, 'on')}
					title={facet.hint}
					class="rounded-pill border px-2.5 py-1 text-[11px] font-medium transition {filter.isSelected(
						facet.key,
						'on'
					)
						? 'border-brand-300 bg-brand-50 text-brand-600'
						: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-800'}"
				>
					{facet.label}
				</button>
			{:else if kindOf(facet) === 'select'}
				<!-- Many values: a native picker beats a pill row that wraps three lines. -->
				<label class="flex items-center gap-1.5 text-[11px] text-ink-500">
					<span class="font-semibold uppercase tracking-wide text-ink-400">{facet.label}</span>
					<select
						value={(filter.selected[facet.key] ?? [])[0] ?? ''}
						onchange={(e) =>
							filter.set(facet.key, e.currentTarget.value ? [e.currentTarget.value] : [])}
						title={facet.hint}
						class="rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none focus:border-brand-400"
					>
						<option value="">All</option>
						{#each options as o (o.value)}
							<option value={o.value}>{o.label} ({filter.countFor(facet, o, items)})</option>
						{/each}
					</select>
				</label>
			{:else}
				<div class="flex flex-wrap items-center gap-1" role="group" aria-label={facet.label}>
					<span class="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
						{facet.label}
					</span>
					{#each options as o (o.value)}
						{@const on = filter.isSelected(facet.key, o.value)}
						{@const n = filter.countFor(facet, o, items)}
						<button
							type="button"
							onclick={() => filter.toggle(facet.key, o.value)}
							aria-pressed={on}
							title={facet.hint}
							class="rounded-pill border px-2 py-0.5 text-[11px] font-medium transition {on
								? 'border-brand-300 bg-brand-50 text-brand-600'
								: 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-800'} {n ===
								0 && !on
								? 'opacity-40'
								: ''}"
						>
							{o.label}
							<span class="ml-0.5 tabular-nums opacity-60">{n}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	{/each}

	{#if filter.active}
		<span class="ml-auto flex items-center gap-2 text-[11px] text-ink-500">
			<span class="tabular-nums" aria-live="polite">{shown} of {total} {filter.noun}</span>
			<button
				type="button"
				onclick={filter.clear}
				class="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 font-medium text-ink-500 transition hover:border-line-strong hover:text-ink-800"
			>
				<Icon name="x" size={11} /> Clear
			</button>
		</span>
	{/if}
</div>
