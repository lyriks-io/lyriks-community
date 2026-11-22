<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { Icon } from '$ui/design-system';
	import { celebrateValidation } from '$ui/evolution/validate-motion';
	import { countOf, type SectionElements } from '$ui/evolution/section-elements';

	/**
	 * Validate the whole section, on a frame or a section of the Specification
	 * 360° (criterion aba60be7, owner 2026-11-07: 'les blocs de validation doivent
	 * tous etre les memes'; EVO-009 for its name): the check of the four acts, the
	 * same square at the same size beside the frame's other acts, the number of
	 * elements it validates written beside the check as the comments write
	 * theirs, its tooltip and accessible name Validate the whole section: N
	 * <elements> still waiting on you (criterion 3f424411). It
	 * validates in the reader's name every element there still waiting on them,
	 * and exists only while something does. Outside a frame that is itself the
	 * place to validate (`always`, the Overview's frames) it shows while the
	 * pointer is on the section (`group/section`), a touch screen and the
	 * keyboard always reaching it, and keeps its height while it is gone so
	 * nothing on the page moves.
	 */
	interface Props {
		/** Elements there still waiting on the reader's validation. */
		count: number;
		/** How the section names its elements, plural: "profiles", "rules". */
		what: SectionElements;
		/** Shown at rest, not only while the pointer is on the section. */
		always?: boolean;
		disabled?: boolean;
		onclick: () => void;
	}
	let { count, what, always = false, disabled = false, onclick }: Props = $props();
	const reveal = $derived(
		always
			? ''
			: 'pointer-events-none opacity-0 transition-opacity duration-150 group-hover/section:pointer-events-auto group-hover/section:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'
	);
	const comeAndGo = (node: Element) => (always ? slide(node, { axis: 'x', duration: 160 }) : fade(node, { duration: 160 }));
	const title = $derived(`Validate the whole section: ${countOf(count, what)} still waiting on you`);
</script>

{#if count > 0}
	<button
		transition:comeAndGo
		type="button"
		class="flex h-7 flex-none items-center gap-1 border-[1.5px] border-ink bg-paper px-2 font-evo-mono text-[0.8125rem] font-bold text-ink transition-colors duration-200 hover:bg-blue-tint hover:text-blue-ink disabled:cursor-default disabled:opacity-60 {reveal}"
		{title}
		aria-label={title}
		data-validate-all
		{disabled}
		onclick={(e) => {
			celebrateValidation(e.currentTarget, e.currentTarget.parentElement);
			onclick();
		}}><Icon name="check" size={14} />{count}</button
	>
{:else if !always}
	<!-- Nothing waits: no check, but its height, so its row does not shrink. -->
	<span aria-hidden="true" class="inline-block h-7 w-0 flex-none"></span>
{/if}
