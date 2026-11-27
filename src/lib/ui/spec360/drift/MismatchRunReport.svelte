<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { RETROSPEC_SECTION, type ChangeVerdict, type ReportCard } from '$domain/retrospec';
	import { sectionSyncKey } from '$lib/shared/section-sync';
	import { pushToast } from '$ui/design-system';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import { writingLine } from './writing-line';
	import { RUN_FOUND_NOTHING } from './mismatch-words';
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
		/** The reader's name, for the green box of a decision that was theirs (YOU). */
		readerName?: string | null;
	}
	let { projectId, report, canWrite = false, readerName = null }: Props = $props();

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
	// Lyriks writes what was validated itself, with the writes the AI prepared (feat-120): nothing is copied.
	async function write(op: 'open_writing' | 'write_remaining') {
		if (!held) return;
		const what = op === 'open_writing' ? 'Writing what you validated' : 'Writing the remaining changes';
		if (await act([{ op }], what)) pushToast({ level: 'info', message: `Lyriks writes the ${held.counts.validated} validated ${held.counts.validated === 1 ? 'change' : 'changes'}` });
	}
	const writingAt = $derived(held?.written ? writingLine(held.written) : null);
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
			<p class="m-0 flex-[1_1_260px] text-sm text-ink-2">{held.counts.total === 0 ? RUN_FOUND_NOTHING : 'Nothing below is in the specification yet. Each change sits beside what the specification says today. Validate only records your decision: once every change is decided, Write the validated changes has Lyriks write them into the specification, exactly as your AI prepared them.'}</p>
			{#if canWrite && !held.writing && held.counts.pending > 1}
				<button type="button" class={BTN} disabled={busy} onclick={validateAll}>Validate all</button>
			{/if}
		</div>
		{#each held.cards as card (card.id)}
			<ReportChangeCard {projectId} {card} {readerName} canDecide={canWrite && !held.writing} {busy} onDecide={(verdict, note) => decide(card, verdict, note)} />
		{/each}
		{#if held.writing && writingAt}
			<div class="{CARD} mt-4 flex flex-wrap items-center gap-3" data-report-writing={writingAt.state}>
				<p class="m-0 flex-[1_1_260px] text-sm text-ink-2" aria-live="polite">
					{writingAt.line}
					{#if writingAt.stop}<br /><span class="text-red-ink">{writingAt.stop}</span>{/if}
				</p>
				{#if writingAt.state === 'stopped' && canWrite}
					{#if held.written?.stop}
						{@const stopped = held.written.stop}
						<!-- A change that no longer applies leaves the report; the next run reports it again (action d113882a). -->
						<button type="button" class={BTN} disabled={busy} onclick={() => void act([{ op: 'leave_out_change', id: stopped.change }], 'Leaving this change out')}>Leave this change out</button>
					{/if}
					<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => void write('write_remaining')}>Write the remaining {writingAt.left}</button>
				{:else if writingAt.state === 'done'}
					<a href="{base}/spec" class="{LINK} self-center">Open Knowledge →</a>
				{/if}
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
					<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => void write('open_writing')}>Write the {held.counts.validated} validated {held.counts.validated === 1 ? 'change' : 'changes'}</button>
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
