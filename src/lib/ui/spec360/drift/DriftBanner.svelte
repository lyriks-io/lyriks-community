<script lang="ts">
	import { specEditsKept, specEditsToReview, type CodeChangeView } from '$domain/retrospec';
	import { useValidation } from '../validation.svelte';
	import { driftDecisionOf } from '../drift-decision';
	import { driftBandOf } from './drift-band';

	/**
	 * The band at the top of every Specification 360° page once it is validated
	 * (criterion 7b21b4a6): how many code changes made outside the spec and the
	 * evolutions wait for a review, and the changes made in the spec by hand,
	 * leading to the Code drift page; once none waits, the rejected changes and
	 * kept edits still waiting for the code to follow. Nothing shows when
	 * neither is left.
	 */
	interface Props {
		projectId: string;
		changes: readonly CodeChangeView[];
	}
	let { projectId, changes }: Props = $props();
	const validation = useValidation();
	const hand = $derived({ toReview: specEditsToReview(validation.doc.specEdits), kept: specEditsKept(validation.doc.specEdits) });
	const band = $derived(driftBandOf(changes.map((c) => driftDecisionOf(validation.doc, c)?.decision ?? null), hand));
	const href = $derived(`/projects/${encodeURIComponent(projectId)}/drift`);
</script>

{#if band}
	<a
		{href}
		class="animate-lk-in mb-7 flex min-h-[52px] w-full items-center gap-3 border-l-[6px] border-orange bg-orange-tint px-4 py-2.5 text-left font-evo text-ink no-underline transition-colors duration-150 hover:text-ink max-[700px]:min-h-11"
	>
		<span aria-hidden="true" class="inline-flex size-[30px] flex-none items-center justify-center border-[1.5px] border-ink-3 bg-transparent text-ink">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9"></path></svg>
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[0.9375rem] leading-normal font-bold">{band.title}</span>
			<span class="mt-0.5 block text-[0.8125rem] leading-normal text-ink-2">{band.lead}</span>
		</span>
		<span class="text-sm font-semibold whitespace-nowrap text-ink underline decoration-[1.5px] underline-offset-[6px]">{band.go} →</span>
	</a>
{/if}
