<script lang="ts">
	import { Icon } from '$ui/design-system';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import BlockControls, { type ValidateControl } from './BlockControls.svelte';
	import type { FindingOutcome } from '$domain/evolution';

	/**
	 * One finding of Project health the request settles, at the Specification
	 * (ac-evo-draft-findings-read): its title and its feature as Project health
	 * reads them, what becomes of it (fixed, saying where when the fix is already
	 * in the product, or kept as it is with the reason), and its own Validate,
	 * which waits until the outcome is chosen.
	 */
	interface FindingLine {
		readonly id: string;
		readonly title: string;
		readonly featureName: string | null;
		readonly blocking: boolean;
		readonly outcome: FindingOutcome;
		readonly reason: string;
	}
	interface Props {
		domId: string;
		number: number;
		finding: FindingLine;
		validate: ValidateControl | null;
		/** Changes what becomes of the finding; null when the reader cannot. */
		choose: ((outcome: FindingOutcome, reason: string) => void) | null;
	}
	let { domId, number, finding, validate, choose }: Props = $props();
	let reason = $state('');
	/** Kept was picked and its reason is being written: the field opens before anything is sent. */
	let keeping = $state(false);
	let field = $state<HTMLTextAreaElement | null>(null);
	$effect(() => {
		reason = finding.reason;
	});
	const waitsOnReader = $derived(validate?.look === 'grey' && !!validate.run);
	const pill = (on: boolean) =>
		`px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.06em] transition-colors ${on ? 'bg-ink text-paper' : 'bg-transparent text-ink-2 hover:bg-toner-1'}`;
	function keep() {
		if (!choose) return;
		// The where of a fix is not the why of a keep: picking Kept starts from an empty reason.
		if (finding.outcome !== 'kept' && !keeping) reason = '';
		const why = reason.trim();
		// Kept needs its why: the reason is what the person signs when the finding leaves the list.
		if (why) {
			keeping = false;
			choose('kept', why);
			return;
		}
		keeping = true;
		queueMicrotask(() => field?.focus());
	}
</script>

<div id={domId} class="flex scroll-mt-36 flex-col gap-2.5 rounded-xl bg-evo-sunken px-4 py-3.5" data-evo-waits={waitsOnReader || null} data-finding-line={finding.id}>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="flex-none font-evo-mono text-xs tracking-[0.06em] text-ink-3">FINDING {number}</span>
		{#if finding.featureName}
			<span class="border-[1.5px] border-blue px-2.5 py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.04em] text-blue-ink">{finding.featureName}</span>
		{/if}
		{#if finding.blocking}
			<span class="inline-flex items-center gap-1 font-evo-mono text-xs font-bold text-red-ink uppercase" title="It stands between the spec and a build: it is fixed, never kept"><Icon name="alert-triangle" size={13} />Blocking</span>
		{/if}
		<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] leading-normal font-bold"><GlossaryText text={finding.title} /></span>
		<BlockControls {validate} />
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<div class="inline-flex gap-1 bg-surface p-0.5" role="group" aria-label="What becomes of this finding">
			<button
				type="button"
				class={pill(finding.outcome === 'fixed' && !keeping)}
				disabled={!choose}
				onclick={() => {
					keeping = false;
					if (finding.outcome !== 'fixed') choose?.('fixed', '');
				}}>Fixed</button
			>
			<button
				type="button"
				class={pill(finding.outcome === 'kept' || keeping)}
				disabled={!choose || finding.blocking}
				title={finding.blocking ? 'A blocking finding is fixed, never kept' : 'Kept as it is, with the reason'}
				onclick={keep}>Kept as it is</button
			>
		</div>
		{#if finding.outcome === 'undecided'}
			<span class="text-xs text-ink-3">Choose what becomes of it before validating it</span>
		{/if}
	</div>
	{#if finding.outcome === 'fixed' && !keeping}
		<label class="flex flex-col gap-1 text-xs text-ink-3">
			<span class="font-evo-mono tracking-[0.06em] uppercase">Where it was fixed (optional)</span>
			<input
				class="rounded-lg border-[1.5px] border-evo-control bg-toner-1 px-3 py-2 text-sm text-evo-ink focus:border-blue focus:outline-none"
				bind:value={reason}
				disabled={!choose}
				onblur={() => {
					if (reason.trim() !== finding.reason) choose?.('fixed', reason.trim());
				}}
				placeholder="When the fix is already in the product: the request or the commit that made it"
			/>
		</label>
	{:else if finding.outcome === 'kept' || keeping}
		<label class="flex flex-col gap-1 text-xs text-ink-3">
			<span class="font-evo-mono tracking-[0.06em] uppercase">Why it is kept as it is</span>
			<textarea
				class="min-h-[2.5rem] rounded-lg border-[1.5px] border-evo-control bg-toner-1 px-3 py-2 text-sm text-evo-ink focus:border-blue focus:outline-none"
				rows="2"
				bind:this={field}
				bind:value={reason}
				disabled={!choose}
				onblur={() => {
					if (reason.trim() && reason.trim() !== finding.reason) keep();
				}}
				placeholder="The reason, signed with the finding when it leaves Project health"
			></textarea>
		</label>
	{/if}
</div>
