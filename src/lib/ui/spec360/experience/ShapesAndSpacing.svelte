<script lang="ts">
	import type { DesignToken } from '$application/spec360/experience';
	import { CARD } from '../page/look';

	/**
	 * Corners and spacing drawn to scale (ac-brand-design-system-read): each
	 * radius a square with that corner, each spacing step a bar of that
	 * length, with their names and values; what a value is for on hover.
	 */
	let { corners, spacing }: { corners: readonly DesignToken[]; spacing: readonly DesignToken[] } = $props();
	// A square of 56px is round from a radius of 28px on: a larger one draws the same circle.
	const ROUND = 28;
</script>

<div class={CARD}>
	{#if corners.length}
		<div class="flex flex-wrap gap-4">
			{#each corners as t (t.name)}
				<span class="flex w-[120px] flex-col items-center gap-1.5 text-center text-[0.6875rem] text-evo-muted" title={t.usage || undefined}>
					<i aria-hidden="true" class="box-border block size-14 border-2 border-evo-violet bg-evo-violet-soft" style:border-radius="{Math.min(t.px ?? 0, ROUND)}px"></i>
					<span class="[overflow-wrap:anywhere]">{t.name} <span class="font-evo-mono">{t.value}</span></span>
				</span>
			{/each}
		</div>
	{/if}
	{#if spacing.length}
		<div class={corners.length ? 'mt-[22px]' : ''}>
			{#each spacing as t (t.name)}
				<div class="flex items-center gap-3 py-1 text-[0.8125rem] text-evo-ink-3" title={t.usage || undefined}>
					<i aria-hidden="true" class="block h-3 min-w-0.5 shrink bg-evo-violet" style:width="{Math.max(2, t.px ?? 0)}px"></i>
					<span class="flex-none">{t.name} <span class="font-evo-mono text-xs text-evo-muted">{t.value}</span></span>
				</div>
			{/each}
		</div>
	{/if}
</div>
