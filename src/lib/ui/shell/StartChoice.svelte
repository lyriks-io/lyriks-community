<script lang="ts">
	// The two ways into an empty project (the design's "How do you want to
	// start?"): rebuild the spec of an existing product from its code, or
	// describe a new one in its Specification 360°; evolutions change it once it
	// holds a feature (criterion 40bef6da).
	let { projectId }: { projectId: string } = $props();
	const base = $derived(`/projects/${encodeURIComponent(projectId)}`);
</script>

{#snippet sparkle(size: number)}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path></svg>
{/snippet}

<div class="flex flex-wrap items-stretch gap-4">
	<a href="{base}/retrospec" class="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 border-2 border-ink bg-paper px-6 py-[22px] text-left text-ink no-underline">
		<span class="flex items-center justify-between gap-2">
			<span class="flex size-10 items-center justify-center border-[1.5px] border-ink bg-paper text-ink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"></path></svg></span>
			<span class="border-[1.5px] border-blue px-[9px] py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-blue-ink uppercase">Existing product</span>
		</span>
		<span class="text-lg font-bold tracking-[-0.01em]">From existing code</span>
		<span class="text-sm leading-[1.55] text-evo-ink-3">Lyriks reads your code, and your docs if you have any, then rebuilds the full specification. You validate it.</span>
		<span class="mt-auto pt-1.5 text-sm font-semibold text-blue-ink">Start a Reverse-Specification →</span>
	</a>
	<a href="{base}/spec" class="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 border border-transparent bg-surface px-6 py-[22px] text-left text-ink no-underline hover:border-line">
		<span class="flex items-center justify-between gap-2">
			<span class="flex size-10 items-center justify-center border-[1.5px] border-ink bg-paper text-ink">{@render sparkle(18)}</span>
			<span class="border-[1.5px] border-ink px-[9px] py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-ink uppercase">New product</span>
		</span>
		<span class="text-lg font-bold tracking-[-0.01em]">From scratch</span>
		<span class="text-sm leading-[1.55] text-evo-ink-3">Describe what you want to build, by hand or with your AI. Lyriks keeps it as its specification; every change after that is an evolution.</span>
		<span class="mt-auto pt-1.5 text-sm font-semibold text-blue-ink">Start from scratch →</span>
	</a>
</div>
