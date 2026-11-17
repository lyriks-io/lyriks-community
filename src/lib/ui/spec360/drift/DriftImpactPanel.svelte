<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import type { DriftImpact, DriftImpactKey, DriftRisk } from '$domain/retrospec';

	/**
	 * The impact analysis of one code change (criterion 94d2468a): the rating,
	 * the sentence that says why, and what the change touches in the spec, row
	 * by row. Read from the specification, never asked of an AI; the short
	 * progress it opens with only lets the eye follow the panel in.
	 */
	interface Props {
		impact: DriftImpact;
		/** False the first moment it opens: the progress shows, then the analysis. */
		ready: boolean;
	}
	let { impact, ready }: Props = $props();

	const RISK: Readonly<Record<DriftRisk, { label: string; tone: string }>> = {
		// The design's tags: a gap in red ink, to watch in orange, validated in green.
		high: { label: 'High impact', tone: 'border-red-ink bg-red-ink text-paper' },
		medium: { label: 'Medium impact', tone: 'border-orange bg-orange text-ink' },
		low: { label: 'Low impact', tone: 'border-green bg-green text-ink' }
	};
	const KEY: Readonly<Record<DriftImpactKey, string>> = { feature: 'Feature', action: 'Action', rule: 'Rule', profile: 'Profile', data: 'Data', tests: 'Tests' };
</script>

<div class="animate-lk-in-fast mt-3.5 border-[1.5px] border-line bg-surface-sunken px-4 py-3.5" role="region" aria-label="Impact analysis" aria-busy={!ready}>
	{#if !ready}
		<div class="font-evo-mono text-[0.8125rem] text-ink-3">Analysing the impact on the current spec…</div>
		<Gauge parts={[{ value: 0, tone: 'bg-blue' }]} total={100} running height={10} class="mt-2.5" />
	{:else}
		<div class="animate-lk-in-fast">
			<div class="flex flex-wrap items-center gap-2.5">
				<b class="text-[0.9375rem] text-ink">Impact analysis</b>
				<span class="border-[1.5px] px-2.5 py-0.5 font-evo-mono text-xs font-bold tracking-[0.06em] uppercase {RISK[impact.risk].tone}">{RISK[impact.risk].label}</span>
			</div>
			<p class="m-0 mt-2 mb-3 text-[0.9375rem] leading-normal text-ink-2">{impact.summary}</p>
			<div class="flex flex-col overflow-hidden border border-line bg-paper">
				{#each impact.rows as row (row.key)}
					<div class="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-line px-3 py-2 text-sm first:border-t-0 max-[560px]:grid-cols-[minmax(0,1fr)] max-[560px]:gap-0.5">
						<span class="pt-0.5 font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">{KEY[row.key]}</span>
						<span class="[overflow-wrap:anywhere]">{row.value}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
