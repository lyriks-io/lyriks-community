<script lang="ts">
	import type { Snippet } from 'svelte';
	import { H2, INTRO } from './look';

	/**
	 * A section of a Specification 360° page: its title 48px under what comes
	 * before, the sentence that says how to read it, and at the right what acts
	 * on the whole section (a "Validate all").
	 */
	interface Props {
		title: string;
		intro?: string;
		id?: string;
		/** The section opens the page: no room above it. */
		first?: boolean;
		actions?: Snippet;
	}
	let { title, intro, id, first = false, actions }: Props = $props();
</script>

<div class="{first ? 'mt-7' : 'mt-12'} flex flex-wrap items-start justify-between gap-x-3" {id}>
	<div class="min-w-0 flex-[1_1_320px]">
		<h2 class={H2}>{title}</h2>
		{#if intro}<p class={INTRO}>{intro}</p>{:else}<div class="mb-4"></div>{/if}
	</div>
	{#if actions}<div class="flex flex-none items-center gap-2">{@render actions()}</div>{/if}
</div>
