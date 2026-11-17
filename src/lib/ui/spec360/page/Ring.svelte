<script lang="ts">
	/**
	 * A gauge of the v2 design: a ring filled to `value` of `max`, the number
	 * in its middle unless `label` says otherwise. Its colour is the caller's
	 * (a project health reads green, amber or red).
	 */
	interface Props {
		value: number;
		max?: number;
		size?: number;
		/** CSS colour of the filled arc. */
		color?: string;
		label?: string | null;
		ariaLabel: string;
	}
	let { value, max = 100, size = 88, color = 'var(--color-evo-green-stroke)', label, ariaLabel }: Props = $props();
	const R = 36;
	const C = 2 * Math.PI * R;
	const share = $derived(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
</script>

<span class="relative inline-block flex-none" style="width: {size}px; height: {size}px">
	<svg width={size} height={size} viewBox="0 0 88 88" role="img" aria-label={ariaLabel}>
		<circle cx="44" cy="44" r={R} fill="none" stroke="var(--color-evo-line-soft)" stroke-width="9"></circle>
		<circle
			cx="44"
			cy="44"
			r={R}
			fill="none"
			stroke={color}
			stroke-width="9"
			stroke-linecap="butt"
			stroke-dasharray="{C * share} {C}"
			transform="rotate(-90 44 44)"
			class="transition-[stroke-dasharray] duration-700 ease-out"
		></circle>
	</svg>
	{#if label !== null}<b class="absolute inset-0 flex items-center justify-center font-bold tracking-[-0.03em] tabular-nums" style="font-size: {Math.round(size * 0.27)}px">{label ?? value}</b>{/if}
</span>
