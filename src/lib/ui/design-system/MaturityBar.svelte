<script lang="ts">
	import {
		MATURITY_STAGE_COUNT,
		stageFromScore,
		stageFromTrl,
		stageLabel,
		stageMeans
	} from './tone';

	/**
	 * Spec maturity rendered the ONLY way it should be shown: one of the named
	 * stages as a segmented bar, never a 0-100 gauge. Reuse this everywhere
	 * maturity/readiness appears so the representation stays consistent across
	 * the app.
	 */
	interface Props {
		/** 0-100 maturity/readiness score; mapped to a stage. */
		score?: number;
		/** Pass a stored 1-9 readiness value directly instead of a score
		    (0 renders an empty bar: nothing scored yet). */
		trl?: number;
		/** Empty-segment styling for dark chrome (sidebar, control center). */
		dark?: boolean;
		class?: string;
	}
	let { score = 0, trl, dark = false, class: klass = '' }: Props = $props();

	const level = $derived(trl != null ? (trl <= 0 ? 0 : stageFromTrl(trl)) : stageFromScore(score));
	const empty = $derived(dark ? 'bg-white/10' : 'bg-surface-sunken');
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
			class="h-1.5 flex-1 rounded-[2px] transition-colors {i < level ? 'bg-brand-500' : empty}"
			title={`${stageLabel(i + 1)} · ${stageMeans(i + 1)}`}
		></span>
	{/each}
</div>
