<script lang="ts" generics="T">
	import Icon from './Icon.svelte';
	import SearchInput from './SearchInput.svelte';
	import type { FacetDef, Filter } from './filter.svelte';
	import { clickedWithin, floatInView } from './float-in-view';

	/**
	 * The toolbar for a `Filter`: the shared search box, then ONE "Filters"
	 * button that opens a panel holding every facet the page declared. The row
	 * stays minimal however many facets a page has: what is selected shows as a
	 * removable chip beside the button, everything else waits in the panel. A
	 * page never renders facet controls itself, so no two lists disagree about
	 * what a filter chip looks like or where "Clear" sits.
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
		/** Show the "n of m" count; a list that reads its own size off the page hides it. */
		showCount?: boolean;
		class?: string;
	}
	let { filter, items, visibleCount, size = 'sm', showCount = true, class: klass = '' }: Props =
		$props();

	const kindOf = (facet: FacetDef<T>) => facet.kind ?? 'pills';
	const total = $derived(items.length);
	const shown = $derived(visibleCount ?? total);

	/** Facets that have something to offer on this list; an empty one is not shown at all. */
	const facets = $derived(filter.facets.filter((f) => filter.optionsFor(f, items).length > 0));

	/** One chip per selected value, labelled the way the panel labels it. */
	const chips = $derived(
		facets.flatMap((facet) => {
			const values = filter.selected[facet.key] ?? [];
			if (kindOf(facet) === 'toggle') {
				return values.includes('on') ? [{ facet, value: 'on', label: facet.label }] : [];
			}
			const labels = new Map(filter.optionsFor(facet, items).map((o) => [o.value, o.label]));
			return values.map((value) => ({
				facet,
				value,
				label: `${facet.label}: ${labels.get(value) ?? value}`
			}));
		})
	);

	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);

	function closeOnOutside(event: MouseEvent) {
		if (open && !clickedWithin(event.target, root, panel)) open = false;
	}
	function closeOnEscape(event: KeyboardEvent) {
		if (open && event.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={closeOnOutside} onkeydown={closeOnEscape} />

<div class="flex flex-wrap items-center gap-2 {klass}">
	<SearchInput
		bind:value={filter.query}
		placeholder={filter.placeholder}
		{size}
		class="w-full max-w-xs"
	/>

	{#if facets.length > 0}
		<div class="relative" bind:this={root}>
			<button
				type="button"
				onclick={() => (open = !open)}
				aria-expanded={open}
				aria-haspopup="dialog"
				class="inline-flex items-center gap-1.5 border-[1.5px] px-3 py-1.5 text-xs font-medium transition {chips.length >
				0
					? 'border-ink bg-ink text-paper'
					: 'border-line bg-paper text-ink hover:border-ink'}"
			>
				<Icon name="sliders" size={13} />
				Filters
				{#if chips.length > 0}
					<span class="bg-orange px-1.5 font-evo-mono text-[0.625rem] font-bold tabular-nums text-ink">
						{chips.length}
					</span>
				{/if}
			</button>

			<!-- Opens whole, inside the window, whatever box holds the bar (criterion 5651ca29). -->
			{#if open}
				<div
					bind:this={panel}
					use:floatInView={{ anchor: root }}
					role="dialog"
					aria-label="Filters"
					class="w-[min(28rem,calc(100vw-2rem))] space-y-3 border-[1.5px] border-ink bg-paper p-4 shadow-pop"
				>
					{#each facets as facet (facet.key)}
						{@const options = filter.optionsFor(facet, items)}
						{@const counts = filter.countsFor(facet, items)}
						{#if kindOf(facet) === 'toggle'}
							<label class="flex cursor-pointer items-center gap-2 text-xs text-ink" title={facet.hint}>
								<input
									type="checkbox"
									checked={filter.isSelected(facet.key, 'on')}
									onchange={() => filter.toggle(facet.key, 'on')}
									class="accent-ink"
								/>
								{facet.label}
							</label>
						{:else if kindOf(facet) === 'select'}
							<!-- Many values: a native picker beats a pill row that wraps three lines. -->
							<label class="block space-y-1">
								<span class="block font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-ink-3 uppercase">
									{facet.label}
								</span>
								<select
									value={(filter.selected[facet.key] ?? [])[0] ?? ''}
									onchange={(e) =>
										filter.set(facet.key, e.currentTarget.value ? [e.currentTarget.value] : [])}
									title={facet.hint}
									class="w-full border-[1.5px] border-ink-3 bg-surface-sunken px-2 py-1.5 text-xs text-ink outline-none focus:border-blue"
								>
									<option value="">All</option>
									{#each options as o (o.value)}
										<option value={o.value}>{o.label} ({counts.get(o.value) ?? 0})</option>
									{/each}
								</select>
							</label>
						{:else}
							<div class="space-y-1" role="group" aria-label={facet.label}>
								<span class="block font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-ink-3 uppercase">
									{facet.label}
								</span>
								<div class="flex flex-wrap gap-1">
									{#each options as o (o.value)}
										{@const on = filter.isSelected(facet.key, o.value)}
										{@const n = counts.get(o.value) ?? 0}
										<button
											type="button"
											onclick={() => filter.toggle(facet.key, o.value)}
											aria-pressed={on}
											title={facet.hint}
											class="border-[1.5px] px-2 py-0.5 text-[0.6875rem] font-medium transition {on
												? 'border-ink bg-ink text-paper'
												: 'border-line bg-paper text-ink hover:border-ink'} {n ===
												0 && !on
												? 'opacity-40'
												: ''}"
										>
											{o.label}
											<span class="ml-0.5 font-evo-mono font-bold tabular-nums opacity-70">{n}</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#each chips as chip (`${chip.facet.key}:${chip.value}`)}
		<button
			type="button"
			onclick={() => filter.toggle(chip.facet.key, chip.value)}
			title="Remove this filter"
			class="inline-flex items-center gap-1 border-[1.5px] border-ink bg-ink px-2 py-0.5 text-[0.6875rem] font-medium text-paper transition hover:bg-ink-2"
		>
			{chip.label}
			<Icon name="x" size={10} />
		</button>
	{/each}

	<!-- The one count of the list, on the row that narrows it, saying what it
	     counts: "40 rules" at rest, "15 of 40 rules" while filtering. -->
	<span class="ml-auto flex items-center gap-2 font-evo-mono text-[0.6875rem] text-ink-3">
		{#if showCount}
			<span class="tabular-nums" aria-live="polite">
				{filter.active ? `${shown} of ${total}` : total}
				{filter.noun}
			</span>
		{/if}
		{#if filter.active}
			<button
				type="button"
				onclick={filter.clear}
				class="inline-flex items-center gap-1 border-[1.5px] border-line bg-paper px-2 py-0.5 font-sans font-medium text-ink transition hover:border-ink"
			>
				<Icon name="x" size={11} /> Clear
			</button>
		{/if}
	</span>
</div>
