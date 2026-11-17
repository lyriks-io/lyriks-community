<script lang="ts">
	import type { DataMapLayout, RetroItem } from '$domain/retrospec';
	import { numberPill } from '$ui/evolution/evo-look';
	import ItemBody from './ItemBody.svelte';
	import ItemControls from './ItemControls.svelte';
	import ItemThread from './ItemThread.svelte';
	import { CARD, flagChip, itemBorder } from './look';
	import { useReview } from './review.svelte';

	/**
	 * One reviewed item as a card, in the design's two shapes: `numbered`
	 * (the Foundations: a "1.2" pill and the controls beside the title) and
	 * `ref` (the other tabs: a mono reference over the title, the controls at
	 * the foot of the card).
	 */
	interface Props {
		item: RetroItem;
		shape: 'numbered' | 'ref';
		next: boolean;
		datamap?: DataMapLayout | null;
	}
	let { item, shape, next, datamap = null }: Props = $props();

	const review = useReview();
	const view = $derived(review.view(item.id));
	const chip = $derived(flagChip(view));
</script>

<div id="rv-{item.id}" class="{CARD} {itemBorder(view)} scroll-mt-36 {shape === 'numbered' ? 'gap-4 p-6' : 'gap-3 px-6 py-5'}">
	{#if shape === 'numbered'}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap items-center gap-3">
				<span class={numberPill(view.state === 'validated')}>{view.state === 'validated' ? '✓' : item.ref}</span>
				<h3 class="m-0 text-lg font-bold">{item.title}</h3>
				{#if chip}<span class=" px-[9px] py-[3px] text-xs font-semibold {chip.look}">{chip.text}</span>{/if}
			</div>
			<ItemControls {item} {next} unsure />
		</div>
		<div class="flex flex-col gap-4"><ItemBody {item} {datamap} /></div>
	{:else}
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
				<div class="flex flex-wrap items-center gap-2.5">
					<span class="font-evo-mono text-xs text-evo-muted">{item.ref}</span>
					<span class="text-base font-bold">{item.title}</span>
				</div>
				{#if item.desc}<span class="text-[0.9375rem] leading-[1.55] text-evo-ink-2">{item.desc}</span>{/if}
			</div>
			{#if chip}<span class=" px-2.5 py-1 text-xs font-semibold {chip.look}">{chip.text}</span>{/if}
		</div>
		<ItemBody {item} {datamap} />
		<div class="flex flex-wrap items-center justify-end gap-2"><ItemControls {item} {next} unsure /></div>
	{/if}
	<ItemThread {item} />
</div>
