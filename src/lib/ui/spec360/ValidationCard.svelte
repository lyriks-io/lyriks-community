<script lang="ts">
	import { STEP_FOOT_ID } from '$ui/evolution/evo-scroll';
	import { useValidation } from './validation.svelte';

	/**
	 * The call to validate the Specification 360° definitively, on every page
	 * once every element is validated: its status then switches from DRAFT to
	 * VALIDATED. A compact band of the same family as the code drift band that
	 * takes its place once validated. Where the team stands before that reads on
	 * the Overview.
	 */
	const validation = useValidation();
	const board = $derived(validation.board);
</script>

{#if board.summary.state === 'draft' && board.complete}
	<div
		id={STEP_FOOT_ID}
		class="animate-lk-in mb-7 flex min-h-[52px] scroll-mt-36 flex-wrap items-center gap-3 border-l-[6px] border-green bg-green-tint px-4 py-2.5 font-evo text-evo-ink"
	>
		<span aria-hidden="true" class="inline-flex size-[30px] flex-none items-center justify-center bg-green text-ink">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>
		</span>
		<span class="min-w-0 flex-[1_1_260px]">
			<span class="block text-[0.9375rem] leading-normal font-bold">Everything is validated</span>
			<span class="mt-0.5 block text-[0.8125rem] leading-normal text-ink-2">Validate the specification definitively: its status switches from DRAFT to VALIDATED.</span>
		</span>
		<button
			type="button"
			class="animate-lk-nudge pressable inline-flex min-h-[34px] flex-none cursor-pointer items-center border-[1.5px] border-ink bg-evo-violet px-3.5 text-xs font-bold tracking-[0.07em] whitespace-nowrap text-white uppercase disabled:cursor-default disabled:opacity-40 max-[700px]:min-h-11"
			disabled={validation.finalizing || !validation.source.canWrite}
			title={validation.source.canWrite ? 'Validate the specification definitively' : 'Ask a project editor to validate it'}
			aria-busy={validation.finalizing}
			onclick={() => void validation.finalize()}>{validation.finalizing ? 'Saving…' : 'Validate definitively'}</button
		>
	</div>
{/if}
