<script lang="ts">
	import { HelpTip, MaturityBar, MATURITY_STAGE_COUNT, ScoreRing, stageFromScore, scoreToTone, toneLabel, toneText, type HelpEntry } from '$ui/design-system';

	export type Reading = 'coverage' | 'coherence' | 'readiness' | 'maturity';
	export interface ReadingKpi {
		key: Reading;
		label: string;
		tag: string;
		hint: string;
		score: number;
		/** Plain-language definition shown behind a "?" next to the reading. */
		help?: HelpEntry;
	}
	interface Props {
		kpis: ReadingKpi[];
		active: string;
		onSelect: (key: string) => void;
	}
	let { kpis, active, onSelect }: Props = $props();

	// Per-reading ring colour, applied as a CSS custom property the scoped rule
	// below reads — so the reused ScoreRing takes the reading's brand colour
	// without editing the design-system component.
	const ringColor: Record<Reading, string> = {
		coverage: 'var(--color-info-500)',
		coherence: 'var(--color-success-500)',
		readiness: 'var(--color-brand-500)',
		maturity: 'var(--color-accent-500)'
	};
</script>

<!-- Segmented control — same look & feel as the other pages so the four
     readings read as one instrument. The ring is coloured per reading
     (coverage→info, coherence→success, readiness→brand, maturity→accent); the verdict word
     carries the score's own status tone. -->
<div class="grid grid-cols-1 gap-1 rounded-xl border border-line bg-surface-sunken p-1 sm:grid-cols-2 xl:grid-cols-4">
	{#each kpis as k (k.key)}
		{@const isActive = k.key === active}
		{@const tone = scoreToTone(k.score)}
		<!-- The "?" is a sibling of the select button, not nested inside it, so we
		     never put an interactive control inside another. -->
		<div class="relative">
			<button
				type="button"
				onclick={() => onSelect(k.key)}
				aria-pressed={isActive}
				class="flex w-full items-center gap-3 rounded-lg p-3 text-left transition {isActive
					? 'bg-surface shadow-sm'
					: 'hover:bg-surface/60'}"
			>
				<span class="reading-ring shrink-0" style="--reading-ring: {ringColor[k.key]}">
					{#if k.key === 'readiness'}
						<span
							class="grid size-11 place-items-center rounded-full border-2 leading-none"
							style="border-color: {ringColor[k.key]}; color: {ringColor[k.key]}"
						>
							<span class="text-[7px] font-bold uppercase tracking-wider">Stage</span>
							<span class="text-base font-extrabold">{stageFromScore(k.score)}/{MATURITY_STAGE_COUNT}</span>
						</span>
					{:else}
						<ScoreRing score={k.score} size={44} />
					{/if}
				</span>
				<div class="min-w-0">
					<div
						class="text-[11px] font-bold uppercase tracking-widest {isActive
							? 'text-ink-800'
							: 'text-ink-400'}"
					>
						{k.label}
					</div>
					<div class="text-[10px] font-semibold leading-tight text-ink-500">{k.tag}</div>
					<div class="text-[13px] font-bold {toneText[tone]}">{toneLabel(tone)}</div>
					{#if k.key === 'readiness'}
						<MaturityBar score={k.score} class="mt-1" />
					{/if}
					<div class="mt-0.5 text-[10.5px] leading-snug {isActive ? 'text-ink-500' : 'text-ink-400'}">
						{k.hint}
					</div>
				</div>
			</button>
			{#if k.help}
				<span class="absolute right-2 top-2">
					<HelpTip {...k.help} />
				</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* Recolour the reused ScoreRing per reading without touching the design-system
	   component: the descendant selector outweighs its own tone class, so the
	   stroke (currentColor) and the number both take the reading's brand colour. */
	.reading-ring :global(span) {
		color: var(--reading-ring);
	}
</style>
