<script lang="ts">
	import type { Snippet } from 'svelte';
	import CiteLinks from '../CiteLinks.svelte';
	import SpecControls from '../SpecControls.svelte';
	import type { EditValues } from '../edits.svelte';
	import { useEditMode } from '../edit-mode.svelte';

	/**
	 * The text of the element a page's head is about (a core feature, a feature,
	 * an action, a user), closed the way About the product closes its summary
	 * (criteria 14a1164c, 416e4885): its comments and its sources as two links of
	 * the text, then, small and on the same line, its cross, its check and the
	 * people it waits on (criterion a4ef7658), never pushed to the far side of
	 * the head. In the Edit mode the text is a field: the links give way to the
	 * controls' own icons, after it.
	 */
	interface Props {
		anchor: string;
		/** What the element is called, for its discussion and its notifications. */
		title: string;
		values?: EditValues | null;
		remove?: { readonly name: string; readonly refusal?: string | null; readonly uses?: readonly { readonly label: string; readonly href: string }[] } | null;
		/** The element's text, as the page draws it (a StagedText in the Edit mode); nothing when it has none. */
		text?: Snippet;
		class?: string;
	}
	let { anchor, title, values = null, remove = null, text, class: klass = '' }: Props = $props();
	const mode = useEditMode();
</script>

<div class="m-0 max-w-[86ch] min-w-0 text-[0.9375rem] leading-[1.6] text-ink-2 {klass}" data-head-text>
	{@render text?.()}{#if !mode.active}<CiteLinks {anchor} />{/if}<SpecControls {anchor} {title} {values} {remove} inline cites trailing />
</div>
