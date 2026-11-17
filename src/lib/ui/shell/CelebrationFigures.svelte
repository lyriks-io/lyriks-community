<script lang="ts">
	/** The figures a success dialog counts, one tile each, popping in one after the other. */
	interface Props {
		figures: readonly { readonly value: number; readonly label: string }[];
	}
	let { figures }: Props = $props();

	// Literal class names, so the stylesheet holds them; a phone reads two per row.
	const COLUMNS = ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'] as const;
	const columns = $derived(COLUMNS[Math.min(4, figures.length)]);
</script>

<div class="grid w-full gap-2 {columns} max-[480px]:grid-cols-2">
	{#each figures as f, i (f.label)}
		<!-- The design's stat tile (.ly-found): sand, a big bold number, a mono label. -->
		<span class="animate-lk-pop flex flex-col gap-0.5 bg-surface px-2 py-2.5" style:animation-delay="{0.15 + i * 0.08}s">
			<span class="text-[1.625rem] leading-none font-bold tracking-[-0.03em] text-ink">{f.value}</span>
			<span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">{f.label}</span>
		</span>
	{/each}
</div>
