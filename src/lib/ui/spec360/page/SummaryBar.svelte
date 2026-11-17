<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	/**
	 * The design's segmented bar and its legend (.ly-segbar, .ly-legend): one
	 * 12px bar split by what is settled, on the toner-2 of what still waits.
	 * Segments draw in order, one slanted cell per thing while the total allows
	 * (criterion b663dee4); the rest of the bar is what waits.
	 */
	interface Segment {
		value: number;
		/** CSS colour. */
		color: string;
		label: string;
	}
	interface Props {
		total: number;
		segments: readonly Segment[];
		/** The legend of what still waits (the sand); none when nothing waits. */
		rest?: { value: number; label: string } | null;
		/** Extra legend entries (a count of major points), drawn as dots. */
		dots?: readonly { value: number; color: string; label: string }[];
	}
	let { total, segments, rest = null, dots = [] }: Props = $props();
	const aria = $derived([...segments.map((s) => `${s.value} ${s.label}`), ...(rest ? [`${rest.value} ${rest.label}`] : [])].join(', '));
</script>

<div class="min-w-0 flex-[1_1_260px]">
	<Gauge parts={segments.map((s) => ({ value: s.value, color: s.color }))} {total} counts height={12} label={aria} />
	<div class="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 font-evo-mono text-xs text-ink-2">
		{#each segments as s (s.label)}<span class="inline-flex items-center gap-1.5"><i class="inline-block size-2.5" style="background: {s.color}"></i>{s.value} {s.label}</span>{/each}
		{#if rest}<span class="inline-flex items-center gap-1.5"><i class="inline-block size-2.5 bg-toner-2"></i>{rest.value} {rest.label}</span>{/if}
		{#each dots as d (d.label)}<span class="inline-flex items-center gap-1.5"><i class="inline-block size-2.5" style="background: {d.color}"></i>{d.value} {d.label}</span>{/each}
	</div>
</div>
