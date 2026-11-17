<script lang="ts" generics="T extends { readonly id: string }">
	import type { Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { crossfade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/**
	 * One level of what a user can reach, in two columns (criterion 1ca9b3b4):
	 * Access, ruled in green with a check, and No access, in grey with a lock,
	 * each with its count; "None" in an empty one. An item granted or taken
	 * back on the page glides from one column to the other (criterion
	 * eba33558). The columns stack on a phone.
	 */
	interface Props {
		yes: readonly T[];
		no: readonly T[];
		/** One item, told which column it sits in. */
		row: Snippet<[T, boolean]>;
	}
	let { yes, no, row }: Props = $props();

	const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	const [send, receive] = crossfade({ duration: still ? 0 : 260, easing: cubicOut });
	const moves = { duration: still ? 0 : 220 };
</script>

{#snippet column(items: readonly T[], access: boolean)}
	<section
		aria-label={access ? 'Access' : 'No access'}
		class="overflow-hidden rounded-evo-card {access ? 'bg-surface' : 'bg-toner-1 text-ink-3'}"
	>
		<h3 class="m-0 flex items-center gap-2 border-b border-evo-line-soft px-[18px] py-3.5 font-evo-mono text-[0.8125rem] font-bold tracking-[0.06em] uppercase {access ? 'bg-green text-ink' : 'bg-toner-2 text-ink-2'}">
			<span aria-hidden="true" class="inline-flex size-[22px] items-center justify-center {access ? 'bg-ink text-green' : 'bg-toner-1 text-ink-3'}">
				{#if access}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"></path></svg>
				{:else}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
				{/if}
			</span>
			{access ? 'Access' : 'No access'}
			<b class="ml-auto px-[9px] py-px text-[0.8125rem] tabular-nums">{items.length}</b>
		</h3>
		<!-- The list stays while it empties, so the last item still glides to the other column. -->
		<ul role="list" class="m-0 list-none p-0">
			{#each items as item (item.id)}
				<li class="border-t border-evo-line-soft first:border-t-0" in:receive={{ key: item.id }} out:send={{ key: item.id }} animate:flip={moves}>
					{@render row(item, access)}
				</li>
			{/each}
		</ul>
		{#if items.length === 0}<p class="m-0 px-[18px] py-4 text-sm text-evo-muted">None</p>{/if}
	</section>
{/snippet}

<div class="grid grid-cols-2 items-start gap-4 max-[700px]:grid-cols-1">
	{@render column(yes, true)}
	{@render column(no, false)}
</div>
