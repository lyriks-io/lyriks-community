<script lang="ts">
	import { scoreToTone, toneText } from './tone';

	interface Props {
		score: number;
		size?: number;
		/** Override the auto (threshold-based) tone color. */
		tone?: 'critical' | 'at-risk' | 'strong';
	}
	let { score, size = 40, tone }: Props = $props();

	const clamped = $derived(Math.max(0, Math.min(100, Math.round(score))));
	const resolvedTone = $derived(tone ?? scoreToTone(clamped));
	// Scale stroke and label with the ring so the number stays legible at any size.
	const strokeWidth = $derived(Math.max(3, Math.round(size / 22)));
	const fontSize = $derived(Math.max(11, Math.round(size * 0.3)));
	const r = $derived((size - strokeWidth * 2) / 2);
	const circumference = $derived(2 * Math.PI * r);
	const offset = $derived(circumference * (1 - clamped / 100));
</script>

<span class="relative inline-grid place-items-center {toneText[resolvedTone]}" style="width:{size}px;height:{size}px">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" class="-rotate-90">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--color-line)" stroke-width={strokeWidth} />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
			style="transition: stroke-dashoffset 400ms ease"
		/>
	</svg>
	<span class="absolute font-semibold tabular-nums" style="font-size:{fontSize}px">{clamped}</span>
</span>
