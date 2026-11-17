<script lang="ts">
	import Gauge from '$ui/design-system/Gauge.svelte';
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import type { Category } from './report-board';
	import type { NextStepId, NextSteps as NextStepsReading } from './next-steps';
	import NextSteps from './NextSteps.svelte';
	import { FOOT_BAR, KICKER, PRIMARY_48 } from './evo-look';

	/**
	 * The executive summary of the verification, the design's first tab: the
	 * share of requirements the code satisfies, the issues counted by section
	 * (each a jump to it), where the evolution stands and what it says in one
	 * sentence. Every number is counted on the report's own lines. Once nothing
	 * is left open, what happens next until the change is live follows
	 * (ac-evo-verd-next-steps).
	 */
	interface Props {
		/** The score as it counts up, and where it lands. */
		shown: number;
		allGreen: boolean;
		verdict: string;
		sentence: string;
		tiles: readonly { readonly category: Category; readonly count: number }[];
		/** Corrections are waiting: the summary offers to prepare them. */
		hasCorrections: boolean;
		onSection: (category: Category) => void;
		onGuide: () => void;
		onDetails: () => void;
		/** The steps left until the change is live; null while points are still open. */
		next: NextStepsReading | null;
		canAct: boolean;
		onAct: (step: NextStepId) => void;
		/** The reader may hand a step of the close to their AI. */
		mayHandOff: boolean;
	}
	let { shown, allGreen, verdict, sentence, tiles, hasCorrections, onSection, onGuide, onDetails, next, canAct, onAct, mayHandOff }: Props = $props();

	// The design's block (.ly-card): sand, flat.
	const TILE = 'flex min-w-0 flex-col gap-3 rounded-evo-card border border-transparent bg-surface px-6 py-5';
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-stretch gap-4">
		<div class="{TILE} flex-[1_1_240px]">
			<span class={KICKER}>SCORE</span>
			<span class="flex flex-wrap items-baseline gap-2.5">
				<span class="text-[2.5rem] leading-none font-bold tracking-[-0.03em] {allGreen ? 'text-green-ink' : 'text-orange-ink'}">{shown} %</span>
				<span class="text-[0.8125rem] text-ink-2">of requirements compliant with the spec</span>
			</span>
			<!-- The design's gauge beside a percentage, drawn whole: green once whole, the warning orange before (criterion b663dee4). -->
			<Gauge parts={[{ value: shown, tone: allGreen ? 'bg-green' : 'bg-orange' }]} total={100} />
		</div>
		<div class="{TILE} flex-[1.6_1_380px]">
			<span class={KICKER}>ISSUES</span>
			<div class="flex flex-wrap gap-2">
				{#each tiles as t (t.category.key)}
					<a
						href="#sec-{t.category.key}"
						class="flex flex-[1_1_70px] flex-col gap-1 rounded-evo-btn px-3 py-2.5 no-underline {t.category.tile}"
						onclick={(e) => {
							e.preventDefault();
							onSection(t.category);
						}}
					>
						<span class="text-[1.75rem] leading-none font-bold tracking-[-0.03em] {t.category.text}">{t.count}</span>
						<span class="font-evo-mono text-xs tracking-[0.06em] uppercase {t.category.text}">{t.category.title}</span>
					</a>
				{/each}
			</div>
		</div>
		<div class="{TILE} flex-[1_1_240px]">
			<span class={KICKER}>STATUS</span>
			<span class="inline-flex items-center gap-2 self-start border-[1.5px] px-3.5 py-2 font-evo-mono text-[0.8125rem] font-bold tracking-[0.06em] uppercase {allGreen ? 'border-green bg-green text-ink' : 'border-orange bg-orange text-ink'}">{verdict}</span>
		</div>
	</div>
	<div class="flex flex-wrap items-stretch gap-4">
		<div class="{TILE} flex-[1_1_300px]">
			<span class={KICKER}>EXECUTIVE SUMMARY</span>
			<p class="m-0 text-base leading-[1.65] text-ink-2">{sentence}</p>
			{#if hasCorrections}
				<a
					href="#guider"
					class="self-start font-semibold text-blue-ink no-underline hover:underline"
					onclick={(e) => {
						e.preventDefault();
						onGuide();
					}}>Prepare the fix with my LLM →</a
				>
			{/if}
		</div>
	</div>
	{#if next}<NextSteps {next} {canAct} {onAct} {mayHandOff} />{/if}
	<PageFoot class={FOOT_BAR}><button type="button" class={PRIMARY_48} onclick={onDetails}>See the results in detail →</button></PageFoot>
</div>
