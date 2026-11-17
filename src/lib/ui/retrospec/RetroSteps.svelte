<script lang="ts" module>
	export type RetroStepKey = 'source' | 'analysis';
</script>

<script lang="ts">
	import CheckMark from './CheckMark.svelte';

	/**
	 * The two steps of a retrospecification (Source, Analysis): the one shown in
	 * black, a step the run went past ticked green with a drawn check (criterion
	 * 642d3667), the analysis green once it finished, a step not reached yet
	 * greyed and closed. The validation itself lives in the Specification 360°.
	 */
	interface Props {
		/** How far the run went: the last step it reached. */
		reached: RetroStepKey;
		current: RetroStepKey;
		/** The analysis finished: its step reads done. */
		finished: boolean;
		onGo: (step: RetroStepKey) => void;
	}
	let { reached, current, finished, onGo }: Props = $props();

	const STEPS: { key: RetroStepKey; label: string }[] = [
		{ key: 'source', label: 'Source' },
		{ key: 'analysis', label: 'Analysis' }
	];
	const order = (k: RetroStepKey) => STEPS.findIndex((s) => s.key === k);
</script>

<!-- The design's stepper (.ly-stepper): an ink-ruled box, the current step ink with its number on orange, a step done
     numbered on green, a step not reached greyed. -->
<nav aria-label="Reverse-Specification steps" class="flex flex-wrap gap-2 border-[1.5px] border-ink bg-paper p-2 max-[760px]:flex-nowrap max-[760px]:overflow-x-auto">
	{#each STEPS as step, i (step.key)}
		{@const isCurrent = step.key === current}
		{@const open = order(step.key) <= order(reached)}
		{@const done = step.key === 'analysis' && finished}
		{@const passed = done || (!isCurrent && order(step.key) < order(reached))}
		<button
			type="button"
			class="flex min-h-14 flex-[1_1_150px] items-center gap-3 px-3.5 py-2 text-left max-[760px]:flex-none {isCurrent
				? 'bg-ink text-paper'
				: passed
					? 'bg-transparent text-ink hover:bg-surface-sunken'
					: open
						? 'bg-transparent text-ink-3 hover:bg-surface-sunken'
						: 'cursor-not-allowed bg-transparent text-ink-4'}"
			disabled={!open}
			aria-current={isCurrent ? 'step' : undefined}
			onclick={() => onGo(step.key)}
		>
			<span
				class="flex size-7 flex-none items-center justify-center border-[1.5px] font-evo-mono text-xs font-bold {passed
					? 'border-green bg-green text-ink'
					: isCurrent
						? 'border-orange bg-orange text-ink'
						: 'border-current bg-transparent'}">{#if passed}<CheckMark size={16} />{:else}{i + 1}{/if}</span
			>
			<span class="min-w-0 text-[0.9375rem] font-semibold">{step.label}</span>
		</button>
	{/each}
</nav>
