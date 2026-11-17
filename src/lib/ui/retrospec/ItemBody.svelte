<script lang="ts">
	import type { DataMapLayout, RetroItem } from '$domain/retrospec';
	import DataMap from './DataMap.svelte';

	/**
	 * What an item says, block by block, the way the design draws each kind:
	 * tiles, a lead with its kicker, symptoms in red, outcomes in green, form
	 * factors as ticked chips, the lexicon with synonyms and banned words,
	 * swatches, a type sample, journey steps with arrows, plain chips, and the
	 * data map. Only the blocks the item holds are drawn.
	 */
	let { item, datamap = null }: { item: RetroItem; datamap?: DataMapLayout | null } = $props();
	const KICKER = 'font-evo-mono text-[0.6875rem] tracking-[0.08em] text-evo-muted';
</script>

{#if item.formFactors}
	<div class="flex flex-col">
		{#each item.formFactors as group (group.group)}
			<div class="flex flex-wrap items-center gap-4 border-t border-evo-line py-2.5">
				<span class="flex flex-[0_0_170px] items-center self-stretch pr-4 text-[0.8125rem] font-semibold text-evo-ink-3">{group.group}</span>
				<div class="flex flex-[1_1_300px] flex-wrap gap-2">
					{#each group.options as option (option)}
						<span class="inline-flex min-h-8 items-center gap-2 rounded-lg border border-evo-violet-edge bg-evo-violet-soft px-3 text-sm text-evo-violet-ink">
							<span aria-hidden="true" class="flex size-3.5 items-center justify-center bg-evo-violet text-[0.625rem] font-bold text-white">✓</span>{option}
						</span>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
{#if item.tiles}
	<div class="flex flex-wrap gap-3">
		{#each item.tiles as tile (tile.k)}
			<div class="flex flex-[1_1_200px] flex-col gap-1 rounded-evo-btn bg-evo-page px-3.5 py-3">
				<span class="text-xs text-evo-muted">{tile.k}</span>
				<span class="font-semibold {tile.v ? '' : 'text-evo-faint'}">{tile.v || 'Not set'}</span>
			</div>
		{/each}
	</div>
{/if}
{#if item.lead}
	<div class="flex flex-col gap-2">
		<span class={KICKER}>{item.lead.kicker}</span>
		<p class="m-0 leading-[1.6]">{item.lead.text}</p>
	</div>
{/if}
{#if item.symptoms}
	<span class={KICKER}>OBSERVED SYMPTOMS</span>
	<div class="-mt-2 flex flex-col gap-2">
		{#each item.symptoms as symptom, i (i)}
			<div class="flex flex-wrap items-center gap-3 rounded-lg bg-evo-red-soft px-3.5 py-2.5">
				<span class="size-2 flex-none bg-evo-red"></span>
				<span class="flex-[1_1_280px]">{symptom}</span>
			</div>
		{/each}
	</div>
{/if}
{#if item.outcomes}
	<span class={KICKER}>EXPECTED OUTCOMES</span>
	<div class="-mt-2 flex flex-col gap-2">
		{#each item.outcomes as outcome, i (i)}
			<div class="flex flex-wrap items-center gap-3 rounded-lg bg-evo-green-soft px-3.5 py-2.5">
				<span class="size-2 flex-none bg-evo-green-stroke"></span>
				<span class="flex-[1_1_280px]">{outcome.label}</span>
				{#if outcome.from || outcome.to}
					<span class="flex items-baseline gap-2 text-[0.8125rem]">
						{#if outcome.from}<span class="text-evo-red line-through">{outcome.from}</span>{/if}
						<span aria-hidden="true" class="text-evo-faint">→</span>
						{#if outcome.to}<span class="font-bold text-evo-green">{outcome.to}</span>{/if}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
{#if item.lexicon}
	<span class={KICKER}>LEXICON · {item.lexicon.length} {item.lexicon.length === 1 ? 'term' : 'terms'}</span>
	<div class="-mt-2 flex flex-col">
		{#each item.lexicon as row (row.term)}
			<div class="flex flex-col gap-1.5 border-t border-evo-line-soft py-3">
				<div class="flex flex-wrap items-baseline gap-2.5">
					<span class="text-[0.9375rem] font-bold">{row.term}</span>
					<span class="flex-[1_1_280px] text-sm text-evo-ink-3">{row.definition}</span>
				</div>
				{#if row.synonyms.length > 0 || row.banned.length > 0}
					<div class="flex flex-wrap gap-3.5">
						{#if row.synonyms.length > 0}
							<span class="flex flex-wrap items-center gap-1.5">
								<span class="font-evo-mono text-[0.625rem] tracking-[0.06em] text-evo-faint">SYNONYMS</span>
								{#each row.synonyms as word (word)}<span class=" border border-evo-green-line bg-evo-green-soft px-2 py-px text-xs text-evo-green">{word}</span>{/each}
							</span>
						{/if}
						{#if row.banned.length > 0}
							<span class="flex flex-wrap items-center gap-1.5">
								<span class="font-evo-mono text-[0.625rem] tracking-[0.06em] text-evo-faint">AVOID</span>
								{#each row.banned as word (word)}<span class=" border border-evo-red-line bg-evo-red-soft px-2 py-px text-xs text-evo-red">{word}</span>{/each}
							</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
{#if item.datamap && datamap}
	<DataMap map={datamap} />
{/if}
{#if item.swatches}
	<div class="flex flex-wrap gap-3">
		{#each item.swatches as swatch, i (i)}
			<div class="flex w-[110px] flex-col gap-1.5">
				<span class="h-14 rounded-lg border border-line" style:background={swatch.color}></span>
				<span class="text-[0.8125rem] font-semibold">{swatch.name}</span>
				<span class="font-evo-mono text-xs break-all text-evo-muted">{swatch.color}</span>
			</div>
		{/each}
	</div>
{/if}
{#if item.typography}
	<div class="flex flex-col gap-1 rounded-evo-btn bg-evo-page p-4" style:font-family={item.typography.family}>
		<span class="text-[2rem] leading-[1.2] font-semibold">Aa Bb Cc 0123</span>
		<span class="text-xl font-semibold">The quick brown fox</span>
		<span class="text-[0.9375rem]">jumps over the lazy dog.</span>
		<span class="font-evo text-xs text-evo-muted">{item.typography.detail}</span>
	</div>
{/if}
{#if item.steps}
	<div class="flex flex-wrap items-center gap-2 rounded-evo-btn bg-evo-page p-3.5">
		{#each item.steps as step, i (i)}
			<span class="flex items-center gap-2">
				<span class="rounded-lg border border-evo-control bg-white px-2.5 py-1.5 text-[0.8125rem]">{step}</span>
				{#if i < item.steps.length - 1}<span aria-hidden="true" class="text-evo-faint">→</span>{/if}
			</span>
		{/each}
	</div>
{/if}
{#if item.chips}
	<div class="flex flex-wrap gap-1.5">
		{#each item.chips as chip, i (i)}
			<span class=" border border-evo-line bg-evo-page px-2.5 py-1 text-[0.8125rem]">{chip}</span>
		{/each}
	</div>
{/if}
