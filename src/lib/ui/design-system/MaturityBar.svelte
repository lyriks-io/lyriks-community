<script lang="ts">
	import {
		MATURITY_STAGE_COUNT,
		clampStageLevel,
		stageFromScore,
		stageLabel,
		stageMeans
	} from './tone';
	import { slantedOutline } from './gauge';

	/**
	 * Spec maturity rendered the ONLY way it should be shown: one of the named
	 * stages as a segmented bar, never a 0-100 gauge. Reuse this everywhere
	 * maturity appears so the representation stays consistent across
	 * the app.
	 */
	interface Props {
		/** 0-100 maturity score; mapped to a stage. */
		score?: number;
		/** Pass a stage (1-5) directly instead of a score
		    (0 renders an empty bar: nothing scored yet). */
		stage?: number;
		/** Empty-segment styling for dark chrome (sidebar, control center). */
		dark?: boolean;
		class?: string;
	}
	let { score = 0, stage, dark = false, class: klass = '' }: Props = $props();

	const level = $derived(stage != null ? (stage <= 0 ? 0 : clampStageLevel(stage)) : stageFromScore(score));
	const empty = $derived(dark ? 'bg-night' : 'bg-toner-2');
</script>

<div
	class="flex items-center gap-0.5 {klass}"
	role="img"
	aria-label={level > 0
		? `Spec maturity: ${stageLabel(level)} (${level} of ${MATURITY_STAGE_COUNT})`
		: 'Spec maturity: nothing scored yet'}
>
	{#each Array(MATURITY_STAGE_COUNT) as _, i (i)}
		<span
			class="h-1.5 flex-1 transition-colors {i < level ? 'bg-blue' : empty}"
			style:clip-path={slantedOutline(6)}
			title={`${stageLabel(i + 1)} · ${stageMeans(i + 1)}`}
		></span>
	{/each}
</div>
