<script lang="ts">
	import { gaugeDrawing, slantedOutline } from './gauge';

	/**
	 * The one bar of the app for how far something stands (criteria 7beb0b83
	 * and b663dee4): cells that count things, or a whole bar for a share, every
	 * cell and every end slanted; or, while something still runs, a slanted
	 * block sweeping along its track.
	 */
	interface Part {
		value: number;
		/** The fill as a class (bg-blue), or as a CSS colour in `color`. */
		tone?: string;
		color?: string;
	}
	interface Props {
		parts: readonly Part[];
		/** What the bar counts out of, or 100 for a percentage. */
		total: number;
		/** The values count things (steps, elements, lines): cells, one per thing, while the total allows. */
		counts?: boolean;
		/** In pixels; the slant follows it. */
		height?: number;
		/** The class of what is not filled. */
		track?: string;
		/** Layout only: width, flex, margins. */
		class?: string;
		/** Read by assistive tech; without it the bar is left to the number beside it. */
		label?: string;
		/** A percentage the bar reads as a progressbar. */
		progress?: number;
		title?: string;
		/** Waiting on something still running: a slanted block sweeps along the track. */
		running?: boolean;
	}
	let { parts, total, counts = false, height = 8, track = 'bg-toner-2', class: klass = '', label, progress, title, running = false }: Props = $props();

	const drawing = $derived(gaugeDrawing(parts.map((p) => p.value), total, counts));
	const outline = $derived(slantedOutline(height));
	const a11y = $derived(
		progress !== undefined
			? { role: 'progressbar', 'aria-valuenow': Math.round(progress), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label }
			: label
				? { role: 'img', 'aria-label': label }
				: { 'aria-hidden': true }
	);
</script>

{#if running}
	<span class="relative block overflow-hidden {track} {klass}" style:height="{height}px" style:clip-path={outline} {title} {...a11y}>
		<i class="animate-lk-sweep absolute inset-y-0 left-0 w-2/5 {parts[0]?.tone ?? 'bg-blue'}" style:background={parts[0]?.color} style:clip-path={outline}></i>
	</span>
{:else if drawing.kind === 'cells'}
	<span class="flex gap-0.5 {klass}" style:height="{height}px" {title} {...a11y}>
		{#each drawing.cells as part, i (i)}
			<i
				class="block h-full min-w-0 flex-1 transition-colors duration-500 {part === null ? track : (parts[part].tone ?? '')}"
				style:background={part === null ? undefined : parts[part].color}
				style:clip-path={outline}
			></i>
		{/each}
	</span>
{:else}
	<span class="block overflow-hidden {track} {klass}" style:height="{height}px" style:clip-path={outline} {title} {...a11y}>
		<span class="flex h-full gap-0.5 transition-[width] duration-500 ease-out" style:width="{drawing.filled}%" style:clip-path={outline}>
			{#each parts as part, i (i)}
				{#if drawing.weights[i] > 0}<i class="block h-full {part.tone ?? ''}" style:background={part.color} style:flex="{drawing.weights[i]} 1 0%"></i>{/if}
			{/each}
		</span>
	</span>
{/if}
