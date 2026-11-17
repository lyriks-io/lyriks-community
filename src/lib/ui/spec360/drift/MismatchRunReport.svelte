<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { RETROSPEC_SECTION, type ChangeVerdict, type ReportCard } from '$domain/retrospec';
	import { sectionSyncKey } from '$lib/shared/section-sync';
	import { pushToast } from '$ui/design-system';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import RetroDelta from '$ui/retrospec/RetroDelta.svelte';
	import { sendRetrospecActs } from '$ui/retrospec/review.svelte';
	import { BANNER, BTN, BTN_MAIN, CARD } from '$ui/spec360/page/look';
	import type { RunReportView } from '$lib/shared/code-drift-page';
	import ReportChangeCard from './ReportChangeCard.svelte';

	/**
	 * Mismatch while a later Reverse-Specification is not validated (criterion
	 * f61f8c94): until its analysis is over, what it reads and the way to the run;
	 * then what a run that holds its changes found, each change decided beside
	 * what the specification reads today (criteria 42311513, 1aaa8316), what was
	 * rejected going back to the AI first (criterion eb132bbd), or what a run that
	 * writes as it reads changed.
	 */
	interface Props {
		projectId: string;
		report: RunReportView;
		canWrite?: boolean;
	}
	let { projectId, report, canWrite = false }: Props = $props();

	const base = $derived(`/projects/${encodeURIComponent(projectId)}`);
	const held = $derived(report.held);
	let busy = $state(false);

	async function act(acts: Record<string, unknown>[], what: string): Promise<boolean> {
		busy = true;
		const ok = await sendRetrospecActs(projectId, acts, what);
		if (ok) await invalidate(sectionSyncKey(projectId, RETROSPEC_SECTION));
		busy = false;
		return ok;
	}
	function decide(card: ReportCard, verdict: ChangeVerdict | null, note?: string) {
		if (verdict === 'reverted') void copyPrompt(card.revertBrief, 'Brief copied: paste it in your LLM session, it brings the code back');
		void act([{ op: 'decide_change', id: card.id, verdict, ...(note ? { note } : {}) }], 'Your decision');
	}
	// One act naming every card still open: a report of hundreds of changes validates in one save.
	const validateAll = () => void act([{ op: 'validate_changes', ids: (held?.cards ?? []).filter((c) => !c.decision).map((c) => c.id) }], 'Validating these changes');
	async function write() {
		if (!held) return;
		await copyPrompt(held.writePrompt, 'Prompt copied: paste it in your LLM session, it writes what you validated');
		await act([{ op: 'open_writing' }], 'Sending what you validated');
	}
	async function close() {
		if (await act([{ op: 'cancel' }], 'Closing this report')) pushToast({ level: 'success', message: 'Report closed: nothing was written' });
	}
	const LINK = 'inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-ink no-underline hover:underline';
</script>

{#if held}
	<div class="mt-[22px] flex flex-col" data-run-report>
		<div class="{CARD} animate-lk-in flex flex-wrap items-center gap-[22px]">
			<div>
				<div class="text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] text-ink">{held.counts.pending}</div>
				<div class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">to decide, of {held.counts.total}</div>
			</div>
			<p class="m-0 flex-[1_1_260px] text-sm text-ink-2">{held.counts.total === 0 ? 'This run found nothing that differs from the specification.' : 'Nothing below is in the specification yet. Each change sits beside what the specification says today. Validate only records your decision: once every change is decided, Write the validated changes has your AI write them into the specification.'}</p>
			{#if canWrite && !held.writing && held.counts.pending > 1}
				<button type="button" class={BTN} disabled={busy} onclick={validateAll}>Validate all</button>
			{/if}
		</div>
		{#each held.cards as card (card.id)}
			<ReportChangeCard {projectId} {card} canDecide={canWrite && !held.writing} {busy} onDecide={(verdict, note) => decide(card, verdict, note)} />
		{/each}
		{#if held.writing}
			<div class="{CARD} mt-4 flex flex-wrap items-center gap-3" data-report-writing>
				<p class="m-0 flex-[1_1_260px] text-sm text-ink-2">Your AI writes the {held.counts.validated} validated {held.counts.validated === 1 ? 'change' : 'changes'}. Then validate the specification in Knowledge.</p>
				<button type="button" class={BTN} onclick={() => copyPrompt(held.writePrompt, 'Prompt copied: paste it in your LLM session, it writes what you validated')}>Copy the prompt</button>
				<a href="{base}/spec" class="{LINK} self-center">Open Knowledge →</a>
			</div>
		{:else if canWrite && held.counts.rejected > 0}
			<div class="{CARD} mt-4 flex flex-wrap items-center gap-3" data-report-rework>
				<p class="m-0 flex-[1_1_260px] text-sm text-ink-2">Nothing is written while a change is rejected: your AI reworks it, then you decide again. Or take the rejection back.</p>
				{#if held.counts.pending === 0 && held.counts.validated === 0}
					<button type="button" class={BTN} disabled={busy} onclick={() => void close()}>Close this report</button>
				{/if}
				<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => copyPrompt(held.reworkPrompt, 'Prompt copied: paste it in your LLM session, it reworks what you rejected')}>Send the {held.counts.rejected} rejected {held.counts.rejected === 1 ? 'change' : 'changes'} to your AI</button>
			</div>
		{:else if canWrite && held.counts.pending === 0}
			<div class="mt-4 flex justify-end">
				{#if held.counts.validated > 0}
					<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => void write()}>Write the {held.counts.validated} validated {held.counts.validated === 1 ? 'change' : 'changes'}</button>
				{:else}
					<button type="button" class={BTN} disabled={busy} onclick={() => void close()}>Close this report</button>
				{/if}
			</div>
		{/if}
	</div>
{:else if report.delta}
	<div class="mt-[22px] flex flex-col gap-3" data-run-report>
		<div class="{BANNER} flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5" data-report-already-written>
			<p class="m-0 flex-[1_1_320px] text-sm leading-normal text-ink">
				<b>Already in the specification</b><br />
				This run started before Lyriks held what a run finds, so it wrote as it read. Only these elements go back to validation.
			</p>
			<a href="{base}/spec" class={LINK}>Open Knowledge →</a>
		</div>
		<RetroDelta {projectId} delta={report.delta} goesBack={false} />
		<p class="m-0 text-[0.8125rem] text-ink-3">The changes made in the code outside Lyriks are compared again once this run is validated.</p>
	</div>
{:else}
	<div class="{CARD} animate-lk-in mt-[22px] px-5 py-7 text-center" data-run-report>
		<b class="mb-1 block text-[0.9375rem] text-ink">The report of this Reverse-Specification shows here when its analysis is over.</b>
		<p class="m-0 text-sm text-ink-2"><span class="font-bold text-ink">Scope</span> · {report.scope}</p>
		<a href="{base}/retrospec" class="mt-3 {LINK}">Open the run →</a>
	</div>
{/if}
