<script lang="ts">
	import { fade, slide } from 'svelte/transition';

	/**
	 * "Validate all" of a section: validates in the reader's name, in one go,
	 * every element of the section still waiting on them. It exists only while
	 * something does, says how many in its tooltip, and shows only while the
	 * pointer is on the section (`group/section` on the section's wrapper), so a
	 * page at rest stays minimal; a touch screen and the keyboard always reach
	 * it. A menu that is itself the place to act (`always`) shows it at rest.
	 * What it skips (an empty element, a rejected one) is the caller's to leave
	 * out of `count`. It fades in and out, and its row keeps the button's height
	 * while it is gone, so nothing on the page moves as it comes and goes. In a
	 * menu (`always`) nothing is kept: once everything is validated the menu
	 * starts with its list, the button folding away instead of leaving a hole.
	 * It is the one validation control's blue button, worded with its count and
	 * no icon of its own (criterion aba60be7).
	 */
	interface Props {
		/** Elements of the section still waiting on the reader's validation. */
		count: number;
		/** How the section names its elements, plural: "features", "actions". */
		what: string;
		/** Shown at rest, not only while the pointer is on the section. */
		always?: boolean;
		/** What the section's elements are, for the tooltip: "of this section" by default. */
		of?: string;
		disabled?: boolean;
		onclick: () => void;
	}
	let { count, what, always = false, of = 'of this section', disabled = false, onclick }: Props = $props();
	const reveal = $derived(
		always
			? 'self-start disabled:opacity-60'
			: 'pointer-events-none ml-auto opacity-0 transition-opacity duration-150 group-hover/section:pointer-events-auto group-hover/section:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:group-hover/section:opacity-60 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'
	);
	const comeAndGo = (node: Element) => (always ? slide(node, { duration: 160 }) : fade(node, { duration: 160 }));
</script>

{#if count > 0}
	<button
		transition:comeAndGo
		type="button"
		class="inline-flex h-7 flex-none items-center border-[1.5px] border-ink bg-evo-violet px-3 font-evo text-xs font-bold tracking-[0.07em] whitespace-nowrap text-white uppercase disabled:cursor-default {reveal}"
		title="Validate the {count} {count === 1 ? what.replace(/s$/, '') : what} {of} still waiting on you"
		{disabled}
		{onclick}
		>Validate all ({count})</button
	>
{:else if !always}
	<!-- Nothing waits: no button, but its height, so its row does not shrink. -->
	<span aria-hidden="true" class="inline-block h-7 w-0 flex-none"></span>
{/if}
