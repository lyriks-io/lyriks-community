<script lang="ts">
	import type { FeatureGap, FeatureScore, FeatureSummary } from '$application/ports';
	import { MATURITY_STAGE_COUNT, floatInView, hoverWithin, clampStageLevel, stageFromScore, stageLabel, stageMeans } from '$ui/design-system';

	interface Props {
		summary: FeatureSummary | null;
		score: FeatureScore | null;
		gaps?: FeatureGap[];
		/** Stage set by hand (1-5). When set, it wins over the engine score. */
		manualStage?: number | null;
		/** In-process maturity % (same engine formula, computed from the leaf's
		    snapshot). Used for the stage only while the advisor score is absent,
		    so the badge never sits empty on a feature that IS scored. */
		fallbackPercentage?: number | null;
		size?: 'sm' | 'md';
	}
	let {
		summary,
		score,
		gaps = [],
		manualStage = null,
		fallbackPercentage = null,
		size = 'sm'
	}: Props = $props();


	// Spec maturity as a named stage: manual override wins; then the engine
	// advice; then the in-process maturity snapshot. Null only when none exists
	// (feature the engine can't read yet). This is depth of SPEC only; whether
	// code exists is the implementation chip's story.
	const level = $derived<number | null>(
		manualStage != null
			? clampStageLevel(manualStage)
			: score
				? stageFromScore(score.percentage)
				: fallbackPercentage != null
					? stageFromScore(fallbackPercentage)
					: null
	);

	// The icon's colour: early stage red, middle orange, advanced green.
	function stageText(l: number): string {
		if (l >= 4) return 'text-success-500';
		if (l >= 2) return 'text-warning-500';
		return 'text-danger-500';
	}

	// The speedometer (spec: criterion 6db00fc4): a half-circle dial of one
	// segment per stage, sweeping left to right, and a needle on the stage
	// reached (at rest on the left while unscored).
	const DIAL = { cx: 12, cy: 12, r: 9, gap: 6 };
	const SEGMENT_SWEEP = 180 / MATURITY_STAGE_COUNT;
	function dialPoint(deg: number, r: number): { x: number; y: number } {
		const rad = (deg * Math.PI) / 180;
		return { x: DIAL.cx + r * Math.cos(rad), y: DIAL.cy - r * Math.sin(rad) };
	}
	const at = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
	const segments = Array.from({ length: MATURITY_STAGE_COUNT }, (_, i) => {
		const from = 180 - i * SEGMENT_SWEEP - DIAL.gap / 2;
		const to = 180 - (i + 1) * SEGMENT_SWEEP + DIAL.gap / 2;
		return `M ${at(dialPoint(from, DIAL.r))} A ${DIAL.r} ${DIAL.r} 0 0 1 ${at(dialPoint(to, DIAL.r))}`;
	});
	const needleTip = $derived(dialPoint(level ? 180 - (level - 0.5) * SEGMENT_SWEEP : 180, DIAL.r - 2.5));

	// The hover card (spec: criterion 6db00fc4): everything about this maturity,
	// shown when the badge's group is hovered. The host row adds `group/maturity`
	// to the slot that also holds its manual-stage picker, which sits over the
	// badge, so hovering either opens the card.
	const percentage = $derived(score?.percentage ?? fallbackPercentage);
	const authored = $derived(
		summary
			? [
					summary.surfaceCount > 0 ? `${summary.surfaceCount} surface(s)` : '',
					summary.actionCount > 0 ? `${summary.actionCount} action(s)` : '',
					summary.stateCount > 0 ? `${summary.stateCount} state(s)` : '',
					summary.entityCount > 0 ? `${summary.entityCount} entit(ies)` : '',
					summary.eventCount > 0 ? `${summary.eventCount} event(s)` : '',
					summary.personaCount > 0 ? `${summary.personaCount} persona(s)` : ''
				].filter(Boolean)
			: []
	);
	let shown = $state(false);
	let anchor = $state<HTMLElement | null>(null);
</script>

<span class="group/maturity relative inline-flex min-w-0 max-w-full">
	<!-- A speedometer: as many dial segments filled as the stage reached, in the
	     stage's colour, and a needle on it (spec: criterion 6db00fc4); grey while
	     unscored. Details on hover. -->
	<span
		class="inline-flex cursor-help items-center gap-1 {level ? stageText(level) : 'text-ink-300'}"
		aria-label={level ? `Spec maturity: ${stageLabel(level)}` : 'Spec maturity: not scored yet'}
	>
		<svg viewBox="0 0 24 14" class="{size === 'sm' ? 'h-3.5 w-6' : 'h-4 w-7'}" aria-hidden="true">
			{#each segments as d, i (i)}
				<path
					{d}
					fill="none"
					stroke-width="3"
					class={level && i < level ? 'stroke-current' : 'stroke-ink-200'}
				/>
			{/each}
			<line
				x1={DIAL.cx}
				y1={DIAL.cy}
				x2={needleTip.x}
				y2={needleTip.y}
				stroke-width="1.5"
				stroke-linecap="round"
				class={level ? 'stroke-ink-700' : 'stroke-ink-300'}
			/>
			<circle cx={DIAL.cx} cy={DIAL.cy} r="1.6" class={level ? 'fill-ink-700' : 'fill-ink-300'} />
		</svg>
		{#if manualStage != null}<span class="text-[0.625rem] text-ink-400">✎</span>{/if}
	</span>

	<!-- The card floats under <body> so no box cuts it (criterion 5651ca29); every group/maturity around the badge opens it, as before. -->
	<span hidden use:hoverWithin={{ selector: '.group\\/maturity', onChange: (on, at) => ((shown = on), (anchor = at)) }}></span>
	{#if shown}
	<div
		use:floatInView={{ anchor, align: 'right' }}
		role="tooltip"
		class="pointer-events-none w-72 rounded-card border border-line bg-surface p-3 text-left text-[0.71875rem] font-normal leading-snug text-ink-700 shadow-xl"
	>
		<div class="flex items-baseline justify-between gap-3">
			<p class="text-[0.59375rem] font-bold uppercase tracking-widest text-ink-400">Spec maturity</p>
			{#if percentage != null}
				<p class="font-mono text-[0.9375rem] font-semibold tabular-nums text-ink-900">{percentage}%</p>
			{/if}
		</div>
		{#if level}
			<p class="mt-1 flex items-center gap-1.5 text-[0.78125rem] font-semibold text-ink-900">
				<span class="size-2 bg-current {stageText(level)}"></span>
				{stageLabel(level)}
				<span class="font-normal text-ink-400">· stage {level} of {MATURITY_STAGE_COUNT}</span>
			</p>
			<p class="mt-0.5 text-ink-500">{stageMeans(level)}{manualStage != null ? ' · set by hand' : ''}</p>
		{:else}
			<p class="mt-1 text-ink-500">Not scored yet.</p>
		{/if}
		{#if score}
			<p class="mt-2 text-ink-500">
				{score.score}/{score.maxScore} checks pass · {score.criticalCount} critical, {score.recommendedCount} recommended
			</p>
		{:else if fallbackPercentage != null}
			<p class="mt-2 text-ink-500">From the spec snapshot; the engine's detail is still coming.</p>
		{/if}
		{#if summary}
			<p class="mt-2 font-semibold text-ink-800">Authored</p>
			<p class="text-ink-500">{authored.length > 0 ? authored.join(' · ') : 'No behavior authored yet.'}</p>
		{/if}
		{#if gaps.length > 0}
			<p class="mt-2 font-semibold text-ink-800">To raise it</p>
			<ul class="mt-0.5 space-y-0.5 text-ink-500">
				{#each gaps.slice(0, 6) as g, i (i)}
					<li>· <span class="text-ink-700">{g.name}</span>: {g.reason}</li>
				{/each}
			</ul>
		{:else if summary && summary.surfaceCount === 0}
			<p class="mt-2 font-semibold text-ink-800">To raise it</p>
			<p class="text-ink-500">Add a surface, an action and a success scenario.</p>
		{/if}
		<p class="mt-2 border-t border-line pt-2 text-[0.65625rem] text-ink-400">Click the icon to set the stage by hand.</p>
	</div>
	{/if}
</span>
