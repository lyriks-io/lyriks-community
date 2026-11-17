<script lang="ts">
	import { deltaCommits, deltaLine, deltaPlaces, deltaSize, specElementHref, type DeltaBlock, type DeltaStatus, type RunDelta } from '$domain/retrospec';
	import { Icon } from '$ui/design-system';

	/**
	 * What a later run changed, at the head of its summary (criterion 03192a6e):
	 * how much and since when, then the list docked on the specification, place
	 * by place, each rule under the action it belongs to. A new or changed
	 * element opens in Knowledge; a removed one has no place left. Until the run
	 * is validated its list lives on Mismatch, which `reportHref` leads to
	 * (criterion f61f8c94 of feat-fb747-traceability).
	 */
	interface Props {
		projectId: string;
		delta: RunDelta;
		/** What it lists goes back to validation, and no one says so above: not once the run is validated, nor while it holds what it found. */
		goesBack: boolean;
		/** Where the list lives instead of here. */
		reportHref?: string | null;
	}
	let { projectId, delta, goesBack, reportHref = null }: Props = $props();

	const PLACES = 12;
	const RULES = 3;
	const size = $derived(deltaSize(delta));
	const commits = $derived(deltaCommits(delta));
	const places = $derived(deltaPlaces(delta));
	let allPlaces = $state(false);
	let unfolded = $state<Record<string, boolean>>({});
	const shownPlaces = $derived(allPlaces ? places : places.slice(0, PLACES));

	const WORD: Readonly<Record<DeltaStatus, string>> = { new: 'New', changed: 'Changed', removed: 'Removed' };
	const TONE: Readonly<Record<DeltaStatus, string>> = { new: 'border-blue-ink text-blue-ink', changed: 'border-orange text-orange-ink', removed: 'border-red-ink text-red-ink' };
	const TAG = 'mt-px inline-flex w-[70px] flex-none justify-center border-[1.5px] py-px font-evo-mono text-[0.6875rem] leading-[1.45] font-bold tracking-[0.06em] uppercase';
	const ROW = 'group -mx-2 flex items-start gap-3 px-2 py-1.5 text-ink no-underline transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken';
	const CHEVRON = 'mt-0.5 flex-none text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink';
</script>

{#snippet head(block: DeltaBlock)}
	{@const h = block.head}
	{#if h.status === 'removed'}
		<div class="flex items-start gap-3 py-1.5" data-delta-element={h.id}>
			<span class="{TAG} {TONE.removed}">{WORD.removed}</span>
			<span class="min-w-0 flex-1 text-[0.9375rem] leading-snug font-semibold text-ink [overflow-wrap:anywhere]">{h.title}</span>
			<span class="flex-none pt-0.5 font-evo-mono text-xs text-ink-3">{h.kind}</span>
		</div>
	{:else}
		<a href={specElementHref(projectId, h.id)} class={ROW} data-delta-element={h.id}>
			{#if h.status}
				<span class="{TAG} {TONE[h.status]}">{WORD[h.status]}</span>
			{/if}
			<span class="min-w-0 flex-1 text-[0.9375rem] leading-snug [overflow-wrap:anywhere] {h.status ? 'font-semibold text-ink' : 'text-ink-2'}">{h.title}</span>
			<span class="flex-none pt-0.5 font-evo-mono text-xs text-ink-3">{h.kind}</span>
			<span class={CHEVRON} aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
		</a>
	{/if}
{/snippet}

<div id="lyriks-delta" data-run-delta class="box-border flex min-w-0 animate-[lk-in_0.35s_ease_both] scroll-mt-24 flex-col gap-4 border border-evo-line bg-surface px-6 py-5">
	<div class="flex flex-col gap-1">
		<h2 class="m-0 text-xl leading-tight font-bold tracking-[-0.02em] text-ink">What changed{size > 0 ? ` · ${size}` : ''}</h2>
		<span class="text-sm leading-normal text-ink-2">{deltaLine(delta)}{commits ? ` ${commits}` : ''}{size > 0 && goesBack ? ' Only these go back to validation.' : ''}</span>
		{#if !reportHref && delta.changed.length > 0}
			<span class="text-sm leading-normal text-ink-2">Open a changed element to read what it says now: Lyriks did not keep what it read before.</span>
		{/if}
	</div>
	{#if reportHref && size > 0}
		<a href={reportHref} class="self-start text-sm font-semibold text-blue-ink no-underline hover:underline">Review on Mismatch →</a>
	{:else}
		{#each shownPlaces as place (place.place)}
			<section class="flex min-w-0 flex-col" data-delta-place={place.place}>
				<h3 class="m-0 border-b border-ink pb-1.5 text-[0.9375rem] leading-snug font-bold text-ink [overflow-wrap:anywhere]">{place.place}</h3>
				{#each place.blocks as block (block.head.id)}
					{@const open = unfolded[block.head.id]}
					{@const rules = open ? block.rules : block.rules.slice(0, RULES)}
					<div class="border-b border-line py-1 last:border-b-0">
						{@render head(block)}
						{#if rules.length > 0}
							<div class="mt-0.5 mb-1 ml-1 flex flex-col border-l-2 border-line pl-3">
								{#each rules as rule (rule.id)}
									<a href={specElementHref(projectId, rule.id)} class={ROW} data-delta-element={rule.id}>
										<span class="{TAG} {TONE[rule.status]}">{WORD[rule.status]}</span>
										<span class="min-w-0 flex-1 text-sm leading-normal text-ink [overflow-wrap:anywhere]">{rule.title}</span>
										<span class={CHEVRON} aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
									</a>
								{/each}
								{#if block.rules.length > RULES}
									<button type="button" class="self-start py-1 text-sm font-semibold text-blue-ink" onclick={() => (unfolded = { ...unfolded, [block.head.id]: !open })}>{open ? 'Show fewer' : `Show all ${block.rules.length} rules`}</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</section>
		{/each}
		{#if places.length > PLACES}
			<button type="button" class="self-start text-sm font-semibold text-blue-ink" onclick={() => (allPlaces = !allPlaces)}>{allPlaces ? 'Show fewer' : `Show all ${places.length} places`}</button>
		{/if}
	{/if}
</div>
