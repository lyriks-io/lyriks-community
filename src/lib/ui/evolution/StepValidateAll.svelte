<script lang="ts">
	import { REVIEW_BUTTON } from './evo-look';
	import { stepValidateTip, waitingCount, type WaitingPart } from './step-validate-all';

	/**
	 * "Validate all (N)" of a whole step, in its foot bar on the left of the main
	 * call to action (the design's rule: secondary actions first, the main one
	 * last). It validates in the reader's name, in one save, everything of the
	 * step still waiting on them, empty and rejected elements left out by the
	 * caller; it shows only while something does.
	 */
	interface Props {
		/** The step as the tabs name it: "Briefing". */
		step: string;
		/** What still waits on the reader, kind by kind. */
		parts: readonly WaitingPart[];
		/** What else the click does or leaves, said after the tip ("accepting the 5 suggestions of your AI they hold"). */
		note?: string;
		onclick: () => void;
	}
	let { step, parts, note = '', onclick }: Props = $props();

	const count = $derived(waitingCount(parts));
	const tip = $derived(note ? `${stepValidateTip(step, parts)}, ${note}` : stepValidateTip(step, parts));
</script>

{#if count > 0}
	<button type="button" class={REVIEW_BUTTON} data-review-control title={tip} {onclick}>
		<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
			><path d="M18 6 7 17l-5-5"></path><path d="m22 10-7.5 7.5L13 16"></path></svg
		>Validate all ({count})
	</button>
{/if}
