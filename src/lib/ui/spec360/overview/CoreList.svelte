<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { CORE_HOLDS_FEATURES } from '$application/spec360/edits';
	import BlockFoot from '../BlockFoot.svelte';
	import CardGrid from '../CardGrid.svelte';
	import InlineEditor from '../InlineEditor.svelte';
	import SpecControls from '../SpecControls.svelte';
	import CountMeter from '../page/CountMeter.svelte';
	import StagedText from '../StagedText.svelte';
	import { useEdits } from '../edits.svelte';
	import { useSources } from '../sources.svelte';
	import { useValidation } from '../validation.svelte';
	import { activateRow } from '$ui/shell/activate-row';

	/**
	 * What the product does (criterion 416e4885): its core features as the
	 * design's area cards, four to a row, each its name and its description,
	 * cut after three and four lines and whole in their tooltips (criterion
	 * f5fdaf55), and its number of features named, with no bar (CountMeter, criterion
	 * 41a9c9d6), a click away from its own page. What it does offers fresh
	 * approval and discussion for its core features as a whole; each reviewed
	 * card keeps its confirmed personal check for withdrawal (criterion f2eabcd9);
	 * what a card carries sits in its bottom right corner. Its editor spans the
	 * card's row, the cards after it making room (CardGrid); in the Edit mode
	 * (criterion 41514698) its edit and its
	 * delete show, a click on its name or description opens its editor in
	 * place, the card's way to its page moves to its corner, and Add a core
	 * feature closes the grid.
	 */
	interface Props {
		cores: readonly { readonly id: string; readonly name: string; readonly description: string; readonly features: number }[];
		/** The page's Edit mode is on and the reader may edit the draft. */
		editable: boolean;
		hrefOf: (id: string) => string;
	}
	let { cores, editable, hrefOf }: Props = $props();
	const edits = useEdits();
	const validation = useValidation();
	const sources = useSources();
	const refusal = (features: number) => (features > 0 ? CORE_HOLDS_FEATURES : null);
	/** What opens under a card (its sources) stays inside it. */
	const footOpen = (anchor: string) => sources?.openAnchor === anchor;
	const CARD = 'relative flex min-w-0 scroll-mt-36 flex-col gap-1.5 border border-line bg-toner px-4 py-3.5';
	// A word too long for its line breaks rather than spill out of the card (criterion f5fdaf55).
	const CUT = '[overflow-wrap:anywhere]';
</script>

<CardGrid class="m-0 grid grid-cols-4 gap-3 p-0 max-[1180px]:grid-cols-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
	{#snippet children(motion)}
	{#each cores as c, i (c.id)}
		{@const anchor = anchorOf('core', c.id)}
		{@const read = { text: c.name, desc: c.description }}
		{@const v = edits.shown(anchor, read)}
		{#if edits.editing === anchor}
			<div id={anchorDomId(anchor)} class={CARD} style={motion.lock(i, true)}><InlineEditor {anchor} /></div>
		{:else}
			<div
				use:activateRow={editable}
				id={anchorDomId(anchor)}
				data-evo-waits={validation.waitsOnMe(anchor) || undefined}
				class="{CARD} group/card transition-colors duration-150 hover:border-ink {editable ? '' : 'cursor-pointer'}"
			>
				{#if editable}
					<!-- Its name and description are fields of the Edit mode, held until Save (criterion 41514698). -->
					<div class="flex flex-col gap-1.5 pr-7">
						<StagedText {anchor} read={read} field="text" label="Name" class="text-[0.9375rem] leading-normal font-bold tracking-[-0.01em] text-ink" />
						<StagedText {anchor} read={read} field="desc" multiline label="Description" class="text-[0.78125rem] leading-[1.45] text-ink-2" />
					</div>
					<a href={hrefOf(c.id)} class="absolute top-2.5 right-2.5 grid size-7 place-items-center text-ink no-underline hover:bg-toner-1" aria-label="Open {v.text}" title="Open {v.text}">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
					</a>
				{:else}
					<!-- A long name or description is cut after its lines, read whole in its tooltip and on its page (criterion f5fdaf55). -->
					<a href={hrefOf(c.id)} data-row-open title={v.text} class="{CUT} line-clamp-3 text-[0.9375rem] leading-normal font-bold tracking-[-0.01em] text-ink no-underline hover:text-ink">{v.text}</a>
					{#if v.desc}<span title={v.desc} class="{CUT} line-clamp-4 text-[0.78125rem] leading-[1.45] text-ink-2">{v.desc}</span>{/if}
				{/if}
				<!-- Its foot: the count at its left; its own confirmed validation, sources and edit acts above the card's link. -->
				<div class="mt-auto flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
					<CountMeter value={c.features} unit="feature" />
					<div data-row-isolated class="relative z-10 ml-auto flex flex-wrap items-center justify-end empty:hidden" data-card-marks>
						<!-- The standard review control, the feature page's (criterion e20318e7). -->
						<SpecControls {anchor} title={v.text} values={v} discussed={false} inline remove={{ name: v.text, refusal: refusal(c.features) }} />
					</div>
				</div>
				{#if footOpen(anchor)}
					<div data-row-isolated class="relative z-10 flex animate-lk-in-fast flex-col gap-2"><BlockFoot {anchor} title={v.text} /></div>
				{/if}
			</div>
		{/if}
	{/each}
	{#if editable}
		<div class="flex">
			<button
				type="button"
				class="flex min-h-[120px] w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-ink-3 bg-transparent text-sm font-semibold text-blue-ink transition-colors duration-150 hover:border-ink hover:bg-toner-1"
				onclick={() => void edits.add('core')}><span aria-hidden="true">+</span>Add a core feature</button
			>
		</div>
	{/if}
	{/snippet}
</CardGrid>
