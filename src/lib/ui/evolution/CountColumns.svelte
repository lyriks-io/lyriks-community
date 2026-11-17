<script lang="ts">
	import { TONE, type Tone } from './verdict-tones';
	/**
	 * A small histogram of counts over ordered buckets (ac-evo-imp-depth-histogram,
	 * ac-evo-board-overview): how far a change ripples, how long requests stand
	 * at their step. One series, so one neutral colour and no legend; the title
	 * names it, every column carries its count and its bucket in words. A bucket
	 * may carry a tone of the colour law (how long a request stood still), and
	 * then its column is drawn in that tone.
	 */
	interface Props {
		title: string;
		buckets: readonly { key: string; label: string; count: number; tone?: Tone }[];
		/** One sentence under the columns: what the shape means for the reader. */
		reading?: string;
	}
	let { title, buckets, reading }: Props = $props();
	// One series reads in the product blue, as the design's gauges do; an empty column is the gauge's toner-2.
	const fill = (tone: Tone | undefined) => (tone ? TONE[tone].dot : 'bg-blue');

	const max = $derived(Math.max(1, ...buckets.map((b) => b.count)));
</script>

<figure class="space-y-1.5">
	<figcaption class="font-mono text-xs tracking-[0.08em] text-ink-500 uppercase">{title}</figcaption>
	<div class="flex items-end gap-2" role="img" aria-label="{title}: {buckets.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', ')}">
		{#each buckets as bucket (bucket.key)}
			<div class="flex min-w-0 flex-1 flex-col items-center gap-1" title="{bucket.label}: {bucket.count}">
				<span class="font-mono text-xs font-bold text-ink-900">{bucket.count}</span>
				<div class="flex h-12 w-full items-end">
					<span
						class="w-full {bucket.count > 0 ? fill(bucket.tone) : 'bg-toner-2'}"
						style="height: {bucket.count > 0 ? Math.max(8, (bucket.count / max) * 100) : 4}%"
					></span>
				</div>
				<span class="text-center text-[0.6875rem] leading-tight text-ink-600">{bucket.label}</span>
			</div>
		{/each}
	</div>
	{#if reading}<p class="text-[0.6875rem] text-ink-700">{reading}</p>{/if}
</figure>
