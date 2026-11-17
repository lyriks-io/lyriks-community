<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A section of a Specification 360° page under its head, after the design
	 * (criterion 14a1164c): a box of paper with a thin line border on the
	 * page's tinted background, its title (.sh2, 19px bold), the sentence that
	 * says how to read it, and at the right what acts on the whole section (a
	 * Validate all, a quiet link).
	 */
	interface Props {
		title: string;
		/** The sentence that says how to read it; a snippet when part of it is a link. */
		intro?: string | Snippet;
		id?: string;
		actions?: Snippet;
		children: Snippet;
		/** Layout only (a column span, a margin). */
		class?: string;
	}
	let { title, intro, id, actions, children, class: klass = '' }: Props = $props();
</script>

<section {id} aria-label={title} class="group/section min-w-0 scroll-mt-36 border border-line bg-paper px-6 pt-6 pb-[26px] max-[760px]:px-4 max-[760px]:pt-5 {klass}">
	<div class="mb-[18px] flex flex-wrap items-end gap-x-4 gap-y-2">
		<div class="grid min-w-0 flex-[1_1_280px] gap-1">
			<h2 class="m-0 text-[1.1875rem] leading-[1.25] font-bold tracking-[-0.015em] text-ink">{title}</h2>
			{#if intro}<p class="m-0 text-[0.84375rem] leading-normal text-ink-2">{#if typeof intro === 'string'}{intro}{:else}{@render intro()}{/if}</p>{/if}
		</div>
		{#if actions}<div class="ml-auto flex flex-none flex-wrap items-center gap-2">{@render actions()}</div>{/if}
	</div>
	{@render children()}
</section>
