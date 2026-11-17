<script lang="ts">
	import { KICKER } from './type-scale';
	import { anchorDomId, anchorOf, type AnchorKind } from '$domain/discussions';
	import type { FactItem } from '$application/spec360/tech';
	import BlockFoot from './BlockFoot.svelte';
	import SectionValidateAll from './SectionValidateAll.svelte';
	import SpecControls from './SpecControls.svelte';
	import { useValidation } from './validation.svelte';
	import { CHIP, LIST } from './page/look';

	/**
	 * A card of titled facts, one per row, each with its chips, its own
	 * discussion and its validation: the shape the design gives Health and the
	 * data facts. The facts are read from the spec's choices, so they are
	 * validated and discussed here, edited where they are chosen. A page whose
	 * section title already carries the section's Validate all hides the card's
	 * own head (`head` false).
	 */
	interface Props {
		items: readonly FactItem[];
		kind: AnchorKind;
		kicker?: string;
		/** How the section names its rows, plural, for its Validate all. */
		what?: string;
		/** The card's own head (its kicker and its Validate all); false where the page's section title holds them. */
		head?: boolean;
		/** Where a chip leads, null for a chip that only reads (a database opens the map on its tables, criterion e8a213be). */
		chipHref?: (item: FactItem, index: number) => string | null;
	}
	let { items, kind, kicker, what = 'facts', head = true, chipHref }: Props = $props();
	const validation = useValidation();
	const anchors = $derived(items.map((i) => anchorOf(kind, i.key)));
	const sectionId = $derived(`kb-facts-${kind}`);
	// A sentence written as a chip would be squeezed: long values read as text.
	const LONG = 48;
</script>

<div id={sectionId} class="group/section {LIST}">
	{#if head}
		<span class="flex min-h-11 flex-wrap items-center gap-2 border-b border-evo-line-soft px-[18px] py-1">
			{#if kicker}<span class="{KICKER} text-evo-muted">{kicker}</span>{/if}
			<SectionValidateAll {anchors} {what} {sectionId} />
		</span>
	{/if}
	{#each items as item (item.key)}
		{@const anchor = anchorOf(kind, item.key)}
		<div id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="flex scroll-mt-36 flex-col gap-2 border-t border-evo-line-soft px-[18px] py-4 first:border-t-0">
			<div class="flex flex-wrap items-start gap-3">
				<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
					<h3 class="m-0 text-[1.0625rem] leading-[1.35] font-bold tracking-[-0.01em] text-evo-ink">{item.title}</h3>
					{#if item.description}<p class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">{item.description}</p>{/if}
					{#if item.chips.length}
						<span class="mt-1 flex flex-wrap gap-1.5">
							{#each item.chips as chip, c (c)}
								{@const href = chipHref?.(item, c) ?? null}
								{#if href}
									<!-- A chip that opens something is pressable, the design's mark of what can be clicked. -->
									<a {href} class="pressable inline-flex items-center gap-1 border-[1.5px] border-ink bg-paper px-2.5 py-0.5 text-[0.8125rem] font-medium text-ink no-underline">{chip}<span aria-hidden="true">→</span></a>
								{:else if chip.length > LONG}
									<span class="block w-full text-sm leading-[1.5] text-evo-ink-3">{chip}</span>
								{:else}
									<span class="{CHIP} px-2.5 py-0.5">{chip}</span>
								{/if}
							{/each}
						</span>
					{/if}
				</div>
				<SpecControls {anchor} title={item.title} />
			</div>
			<BlockFoot {anchor} title={item.title} />
		</div>
	{/each}
</div>
