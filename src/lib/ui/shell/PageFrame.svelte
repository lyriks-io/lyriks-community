<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
		/** The reading column of the Specification 360° v2 design: 880px, its blocks spaced by their own titles. */
		narrow?: boolean;
		/**
		 * The page across the whole room right of the navigation, as the sidebar design lays out the
		 * Specification 360° and its follow-up: 22px above, 26px on each side, its head a band of paper.
		 */
		wide?: boolean;
	}
	let { children, class: extra = '', narrow = false, wide = false }: Props = $props();
	const look = $derived(
		wide ? 'lk-page-wide w-full px-[26px] pt-[22px]' : narrow ? 'lk-page-narrow max-w-[880px] px-5 pt-9' : 'max-w-[1200px] gap-8 px-6 pt-8'
	);
</script>

<!-- The page column of the design: 1200px wide, centred under the app bar, 32px
     between its blocks; app.css sets the room under it and narrows it on a phone (.lk-page). -->
<div class="lk-page mx-auto box-border flex w-full flex-col {look} {extra}">
	{@render children()}
</div>
