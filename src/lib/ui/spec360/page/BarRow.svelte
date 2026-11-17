<script lang="ts">
	import type { Snippet } from 'svelte';
	import { activateRow } from '$ui/shell/activate-row';

	/**
	 * One row of the v2 design's lists: what it is (a name, a line under it),
	 * its count naming what it counts ('5 features'), a chevron; no bar
	 * (criterion 41a9c9d6). The whole row opens `href` (or runs `onclick`, a row
	 * that unfolds in place when `expanded` is set); what acts on the row
	 * itself (validation, comments) sits in `controls`, above the row's link.
	 */
	interface Props {
		title: string;
		desc?: string;
		/** Rich description ending in canonical local discussion/source links. */
		description?: Snippet;
		/** Editing can hold an expandable row open without toggling from its background. */
		disabled?: boolean;
		href?: string;
		onclick?: () => void;
		/** A row that unfolds in place: its chevron turns and it says so to assistive tech. */
		expanded?: boolean;
		/** The count the row shows; a string is a placeholder. */
		value?: number | string | null;
		/** What the count counts, singular ('feature'): the row reads '5 features', never a bare number. */
		unit?: string;
		/** At the left of the name: an avatar, an icon. */
		lead?: Snippet;
		/** Right after the name, on its line: a New badge, a status. */
		badge?: Snippet;
		/** What acts on the row itself, between the count and the chevron. */
		controls?: Snippet;
		/** The row is the one on screen (a selected element). */
		current?: boolean;
		muted?: boolean;
		/** The row is a block of the spec: its anchor's DOM id, so validation and reveal-with-block find it. */
		id?: string;
		/** The block waits on the reader's validation (data-evo-waits). */
		waits?: boolean;
		/** Shown when the name is pointed at: a description the row does not print. */
		hint?: string;
		/** False where the caller's own list item holds the row with what unfolds under it (a journey and its steps). */
		listitem?: boolean;
		/** The line under the name holds on one line, cut with an ellipsis (its full text in the tooltip). */
		oneLine?: boolean;
	}
	let { title, desc, description, disabled = false, href, onclick, expanded, value = null, unit, lead, badge, controls, current = false, muted = false, id, waits = false, hint, listitem = true, oneLine = false }: Props = $props();

	const interactive = $derived(!!href || !!onclick);
	const NAME = 'block font-bold text-evo-ink no-underline';
</script>

<div
	use:activateRow={disabled || !interactive}
	role={listitem ? 'listitem' : undefined}
	{id}
	data-evo-waits={waits || undefined}
	class="group/row relative grid scroll-mt-36 min-h-[58px] items-center gap-x-[18px] gap-y-1.5 border-t border-evo-line-soft px-[18px] py-3 text-left first:border-t-0 {controls
		? 'grid-cols-[minmax(0,1fr)_auto_auto_16px]'
		: 'grid-cols-[minmax(0,1fr)_auto_16px]'} {interactive
		? 'cursor-pointer transition-colors duration-150 hover:bg-evo-hover'
		: ''} {current ? 'bg-evo-violet-wash' : ''}"
>
	<span class="flex min-w-0 items-center gap-3">
		{#if lead}{@render lead()}{/if}
		<span class="min-w-0">
			<span class="flex flex-wrap items-center gap-x-2">
				{#if href}
					<a {href} data-row-open title={hint} class="{NAME} group-hover/row:text-evo-violet {muted ? 'font-medium text-evo-muted' : ''}">{title}</a>
				{:else if onclick}
					<button type="button" data-row-target data-row-open {disabled} aria-expanded={expanded} {onclick} class="{NAME} cursor-pointer border-0 bg-transparent p-0 text-left group-hover/row:text-evo-violet {expanded ? 'text-evo-violet' : ''}">{title}</button>
				{:else}
					<span class={NAME}>{title}</span>
				{/if}
				{#if badge}<span class="relative z-10 inline-flex items-center gap-1.5">{@render badge()}</span>{/if}
			</span>
			{#if description}<span class="mt-0.5 block text-sm text-evo-ink-2">{@render description()}</span>{:else if desc}<span class="mt-0.5 block text-sm text-evo-ink-2 {oneLine ? 'truncate' : ''}" title={oneLine ? desc : undefined}>{desc}</span>{/if}
		</span>
	</span>
	<span class="text-[0.8125rem] whitespace-nowrap">
		{#if value !== null && value !== undefined}<span class="block text-right text-evo-muted"
				><b class="font-evo-mono text-evo-ink tabular-nums">{value}</b>{#if unit && typeof value === 'number'}&nbsp;{value === 1 ? unit : `${unit}s`}{/if}</span
			>{/if}
	</span>
	{#if controls}<span data-row-isolated class="relative z-10 flex items-center gap-1.5">{@render controls()}</span>{/if}
	{#if interactive}
		{#if onclick}
			<button type="button" {onclick} {disabled} aria-label="{expanded ? 'Collapse' : 'Expand'} {title}" aria-expanded={expanded} class="grid size-7 cursor-pointer place-items-center border-0 bg-transparent p-0"><svg class="flex-none text-evo-ink transition-transform duration-200 {expanded ? 'rotate-90' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg></button>
		{:else}<svg class="flex-none text-evo-ink transition-transform duration-200 {expanded ? 'rotate-90' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>{/if}
	{:else}
		<span></span>
	{/if}
</div>
