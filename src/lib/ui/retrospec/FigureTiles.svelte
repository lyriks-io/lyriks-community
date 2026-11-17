<script lang="ts">
	/**
	 * The two headline figures of a reading: the share of the spec the code index
	 * located in the code, and the share of what was read that cites its source.
	 * Shown by the Retrospecification's summary and by the run the specification
	 * stands on in the Overview's Retrospecifications, so both read the same.
	 */
	let { code, traced, class: klass = '' }: { code: number | null; traced: number | null; class?: string } = $props();
</script>

<div class="grid w-full grid-cols-2 gap-2.5 max-[420px]:grid-cols-1 {klass}">
	<span class="flex flex-col gap-0.5 bg-green-tint px-3.5 py-3" title="Share of the specification's elements the code index located in the code">
		{#if code !== null}
			<span class="text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-green-ink">{code} %</span>
			<span class="font-evo-mono text-xs tracking-[0.06em] text-green-ink uppercase">of the spec found in the code</span>
		{:else}
			<span class="text-lg leading-tight font-bold tracking-[-0.02em] text-green-ink">Not measured</span>
			<span class="text-[0.8125rem] text-ink-2">Your LLM syncs the code index at the end: the share of the spec found in the code reads here then.</span>
		{/if}
	</span>
	<span class="flex flex-col gap-0.5 bg-blue-tint px-3.5 py-3" title="Share of the features, rules, scenarios, terms and roles read from the code that cite their source">
		{#if traced !== null}
			<span class="text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-blue-ink">{traced} %</span>
			<span class="font-evo-mono text-xs tracking-[0.06em] text-blue-ink uppercase">of items citing their source</span>
		{:else}
			<span class="text-lg leading-tight font-bold tracking-[-0.02em] text-blue-ink">Not measured</span>
			<span class="text-[0.8125rem] text-ink-2">Nothing read from the code cites a source yet.</span>
		{/if}
	</span>
</div>
