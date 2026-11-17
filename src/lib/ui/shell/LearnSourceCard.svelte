<script lang="ts">
	import type { LearnSource } from './learn-sources';

	/**
	 * One way to learn an existing product (criterion 1ba1817e): its icon, with
	 * Recommended and a tick box at the top right, then its name, what happens,
	 * and the kinds of source it reads as small tags. Several can be picked
	 * together, so the tick box says whether this one is.
	 */
	let { source, picked, onpick }: { source: LearnSource; picked: boolean; onpick: () => void } = $props();
</script>

<!-- The design's choice card (.ly-choice): sand at rest, paper with an ink border once chosen. -->
<button
	type="button"
	aria-pressed={picked}
	data-learn={source.key}
	onclick={onpick}
	class="flex min-h-[230px] min-w-0 cursor-pointer flex-col gap-2.5 p-[18px] text-left text-evo-ink {picked ? 'border-2 border-ink bg-paper' : 'border border-transparent bg-surface hover:border-line'}"
>
	<span class="flex items-start justify-between gap-2">
		<span aria-hidden="true" class="flex size-[38px] flex-none items-center justify-center border-[1.5px] border-ink bg-paper text-ink">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={source.icon}></path></svg>
		</span>
		<span class="flex items-center gap-2">
			{#if source.recommended}<span class="border-[1.5px] border-blue px-2 py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase">Recommended</span>{/if}
			<span aria-hidden="true" data-tick={picked || undefined} class="flex size-[22px] flex-none items-center justify-center border-[1.5px] border-ink {picked ? 'bg-ink text-paper' : 'bg-paper text-transparent'}">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
			</span>
		</span>
	</span>
	<span class="pt-2 text-base font-bold">{source.name}</span>
	<span class="text-[0.8125rem] leading-normal text-evo-ink-3">{source.line}</span>
	<span class="mt-auto flex flex-wrap gap-1 pt-1">
		{#each source.tags as tag (tag)}
			<span class="border border-line bg-paper px-1.5 py-px font-evo-mono text-[0.6875rem] text-ink-2">{tag}</span>
		{/each}
	</span>
</button>
