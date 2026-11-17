<script lang="ts">
	import type { Snippet } from 'svelte';
	import StagedText from '../StagedText.svelte';
	import CiteLinks from '../CiteLinks.svelte';
	import BlockFoot from '../BlockFoot.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import { useEdits } from '../edits.svelte';
	import { activateRow } from '$ui/shell/activate-row';

	/**
	 * A row of a list that opens a page (a core feature in Features, a feature on its core feature's page): its name
	 * and its badge, its wrapping description and canonical discussion/evidence links, how many it holds named ('5 features', no bar:
	 * criterion 41a9c9d6) and a chevron; its link opens the page beside the row's validation (criterion 89d4c960).
	 * In the Edit mode (criterion 41514698) its name
	 * and description are fields held until Save, the page a click on the chevron at its end. Out of it a long
	 * name is cut after two lines, whole in its tooltip; its description wraps in full (criterion 57ee9b9b).
	 */
	interface Props {
		anchor: string;
		name: string;
		description: string;
		/** Out of the Edit mode the row reads its description under its name; a list of names alone leaves it out. */
		showDescription?: boolean;
		href: string;
		count: number;
		/** What the count counts, singular: 'feature'. */
		unit: string;
		/** Right after the name: its New or Changed badge. */
		badge?: Snippet;
		/** Acts on this row alone, outside its navigation link; hidden while its fields are edited. */
		controls?: Snippet;
	}
	let { anchor, name, description, showDescription = true, href, count, unit, badge, controls }: Props = $props();
	const mode = useEditMode();
	const edits = useEdits();
	const read = $derived({ text: name, desc: description });
	// A text just saved reads at once, before the page has read the spec again.
	const shown = $derived(edits.shown(anchor, read));
	const fields = $derived(mode.active && !!edits.shape(anchor));
	const ROW = 'grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border border-line bg-toner px-4 py-2.5 text-ink';
	const NAME = 'min-w-0 text-[0.90625rem] font-semibold [overflow-wrap:anywhere]';
	const DESC = 'text-[0.78125rem] leading-[1.45] text-ink-2';
</script>

{#snippet counted()}
	<span class="font-evo-mono text-xs whitespace-nowrap text-ink-3"><b class="font-semibold text-ink-2 tabular-nums">{count}</b>&nbsp;{count === 1 ? unit : `${unit}s`}</span>
{/snippet}

<div class="relative">
{#if fields}
	<div class={ROW}>
		<span class="flex min-w-0 flex-col gap-1">
			<span class="flex flex-wrap items-center gap-2.5">
				<StagedText {anchor} {read} field="text" label="Name" class={NAME} />
				{@render badge?.()}
			</span>
			<StagedText {anchor} {read} field="desc" multiline label="Description" class={DESC} />
		</span>
		{@render counted()}
		<a {href} class="grid size-8 place-items-center text-ink no-underline hover:bg-toner-1" aria-label="Open {shown.text}" title="Open {shown.text}">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
		</a>
	</div>
{:else}
	<div use:activateRow={mode.active} class="flex min-h-[52px] min-w-0 cursor-pointer flex-wrap items-center border border-line bg-toner text-ink hover:border-ink">
		<div class="grid min-w-0 flex-[1_1_260px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-2.5">
			<span class="flex min-w-0 flex-col gap-0.5">
				<span class="flex flex-wrap items-center gap-2.5">
					<a {href} data-row-open class="min-w-0 text-ink no-underline hover:text-ink focus-visible:outline-offset-[-2px]">
						<strong class="{NAME} line-clamp-2" title={shown.text}>{shown.text}</strong>
					</a>
					{@render badge?.()}
				</span>
				<span class="{DESC} [overflow-wrap:anywhere]">{#if showDescription && shown.desc}{shown.desc}{/if}<CiteLinks {anchor} /></span>
			</span>
			{@render counted()}
			<a {href} class="grid size-8 place-items-center font-evo-mono text-base leading-none text-ink-3 no-underline hover:text-ink" aria-label="Open {shown.text}" title="Open {shown.text}">›</a>
		</div>
		{#if controls}
			<span data-row-isolated class="ml-auto flex max-w-full flex-none flex-wrap items-center justify-end px-4 py-2.5 empty:hidden" role="group" aria-label="Validation of {shown.text}">{@render controls()}</span>
		{/if}
	</div>
{/if}
	<div class="empty:hidden"><BlockFoot {anchor} title={shown.text} /></div>
</div>
