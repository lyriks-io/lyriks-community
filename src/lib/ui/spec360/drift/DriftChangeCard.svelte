<script lang="ts">
	import { pushToast } from '$ui/design-system';
	import { timeAgo } from '$ui/shell/notification-view';
	import { specElementHref } from '$domain/retrospec';
	import type { DriftChangeView } from '$lib/shared/code-drift-page';
	import { BTN, BTN_MAIN, LABEL, LINK } from '../page/look';
	import type { DriftReview } from './drift-review.svelte';
	import DriftImpactPanel from './DriftImpactPanel.svelte';
	import DriftRestorePanel from './DriftRestorePanel.svelte';

	/**
	 * One code change made outside Lyriks (criteria 4903ceb0, 53e7e3da,
	 * 537e1684): its type, where it belongs and where the code is, what the spec
	 * says beside what the code reads now, then the impact analysis, the
	 * acceptance into the spec, the rejection with the brief that restores the
	 * code, and once decided, the decision with its Undo. A rejected change stays
	 * here, waiting for the code to follow the spec.
	 */
	interface Props {
		projectId: string;
		change: DriftChangeView;
		review: DriftReview;
	}
	let { projectId, change, review }: Props = $props();

	const decision = $derived(review.decisionOf(change));
	let open = $state<'impact' | 'restore' | null>(null);
	/** The impact was shown once: it opens again without its progress. */
	let analysed = $state(false);
	/** The reader's edit of the brief; until there is one, the brief is the server's. */
	let edit = $state<string | null>(null);
	let busy = $state(false);

	// The design's tags (.ly-tag) in the status hues: a gap orange, a loss red ink, a move neutral.
	const TYPE_TONE = { changed: 'border-orange text-orange-ink', gone: 'border-red-ink text-red-ink', moved: 'border-ink text-ink' } as const;
	/** Rejecting is a warning action (.ly-btn--warn): red ink border and word; filled red ink while its brief is open. */
	const WARN = BTN.replace('border-evo-ink', 'border-red-ink').replace('text-evo-ink', 'text-red-ink');
	const WARN_ON = BTN_MAIN.replace('bg-evo-violet', 'bg-red-ink');

	function toggleImpact() {
		if (open === 'impact') return void (open = null);
		open = 'impact';
		if (!analysed) setTimeout(() => (analysed = true), 450);
	}

	async function run(act: () => Promise<boolean>, said: string) {
		busy = true;
		const ok = await act();
		busy = false;
		if (ok) pushToast({ level: 'success', message: said });
		return ok;
	}

	async function accept() {
		open = null;
		await run(() => review.accept(change), 'Accepted into the spec: a new version of the spec is captured');
	}

	function reject() {
		void run(() => review.reject(change), 'Rejected: the restore brief is ready for your AI');
	}

	function undo() {
		void run(() => review.undo(change), 'Decision undone: the change is to review again');
	}

	const href = $derived(specElementHref(projectId, change.elementId));
	const codeNow = $derived(change.snippet ? `“${change.snippet}”` : `“${change.elementName}” is no longer in it`);
</script>

<section
	class="mt-4 border-[1.5px] px-5 py-[18px] transition-colors duration-200 max-[700px]:px-4 {decision?.decision === 'kept'
		? 'border-green bg-surface'
		: decision?.decision === 'sent_back'
			? 'border-ink-3 bg-surface-sunken'
			: 'border-evo-line bg-surface'}"
	aria-label={change.title}
>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="border-[1.5px] px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {TYPE_TONE[change.shift]}">{change.type}</span>
		<span class="text-sm text-ink-2">{change.coreName ? `${change.coreName} › ` : ''}{change.featureName}</span>
		{#if decision?.decision === 'kept'}
			<span class="animate-lk-pop ml-auto border-[1.5px] border-green bg-green px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink uppercase">Accepted</span>
		{:else if decision?.decision === 'sent_back'}
			<span class="animate-lk-pop ml-auto border-[1.5px] border-ink px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink uppercase">Rejected · restore requested</span>
		{/if}
	</div>
	<h3 class="m-0 mt-2.5 mb-0.5 text-lg leading-snug font-bold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{change.title}</h3>
	<div class="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-3">
		<span class="font-evo-mono text-[0.8125rem] break-all">{change.where}</span>
		<span aria-hidden="true">·</span>
		<a {href} class="font-semibold text-blue-ink no-underline hover:underline">See it in the spec</a>
	</div>

	<div class="mt-3.5 grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1fr)] items-stretch max-[700px]:grid-cols-[minmax(0,1fr)]">
		<!-- The design's comparison (.ly-compare): the spec on green, the code on red, each with a 6px edge. -->
		<div class="border-[1.5px] border-l-[6px] border-green-ink bg-green-tint px-3.5 py-3">
			<div class="{LABEL} text-green-ink">In the spec</div>
			<p class="m-0 mt-1.5 text-[0.9375rem] leading-normal text-ink [overflow-wrap:anywhere]">{change.specText}</p>
		</div>
		<div class="flex flex-col items-center justify-center font-evo-mono text-xs font-bold text-ink-2 max-[700px]:flex-row max-[700px]:gap-1.5 max-[700px]:py-1.5" aria-hidden="true">
			<svg class="max-[700px]:rotate-90" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg><span>drift</span>
		</div>
		<div class="border-[1.5px] border-l-[6px] border-red-ink bg-red-tint px-3.5 py-3">
			<div class="{LABEL} text-red-ink">In the code now</div>
			{#if change.snippet}
				<p class="m-0 mt-1.5 font-evo-mono text-[0.8125rem] leading-normal text-ink [overflow-wrap:anywhere]">{change.snippet}</p>
			{:else}
				<p class="m-0 mt-1.5 text-[0.9375rem] leading-normal text-ink [overflow-wrap:anywhere]">{change.shift === 'gone' ? 'No longer found in the code.' : change.what}</p>
			{/if}
		</div>
	</div>

	{#if !decision}
		<div class="mt-3.5 flex flex-wrap items-center gap-1.5">
			<button type="button" class="{open === 'impact' ? BTN_MAIN : BTN} max-[700px]:min-h-11" aria-expanded={open === 'impact'} onclick={toggleImpact}>Impact analysis</button>
			{#if review.canWrite}
				<button type="button" class="{BTN} max-[700px]:min-h-11" disabled={busy} onclick={() => void accept()}>Accept into the spec</button>
				<button
					type="button"
					class="{open === 'restore' ? WARN_ON : WARN} max-[700px]:min-h-11"
					aria-expanded={open === 'restore'}
					onclick={() => (open = open === 'restore' ? null : 'restore')}>Reject and restore…</button
				>
			{:else}
				<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'restore'} onclick={() => (open = open === 'restore' ? null : 'restore')}>Show the brief</button>
				<span class="text-[0.8125rem] text-ink-3">A project editor accepts or rejects it.</span>
			{/if}
		</div>
	{:else}
		<div class="animate-lk-in-fast mt-3">
			<p class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]">
				{#if decision.decision === 'kept'}
					The spec now follows the code{decision.version ? ` (version ${decision.version})` : ''}: {codeNow}
				{:else}
					Waiting for the code to follow the spec: this change leaves the list once the code reads as the spec again.
				{/if}
				<span class="whitespace-nowrap">· {decision.by}, {timeAgo(decision.at)}</span>
			</p>
			<div class="mt-1 -ml-1 flex flex-wrap items-center gap-x-2">
				{#if review.canWrite}
					<button
						type="button"
						class="{LINK} max-[700px]:min-h-11"
						disabled={busy}
						title={decision.decision === 'kept' ? 'The change reads to review again; the version this acceptance captured stays in the history' : 'The change reads to review again'}
						onclick={undo}>Undo</button
					>
				{/if}
				{#if decision.decision === 'sent_back'}
					<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'restore'} onclick={() => (open = open === 'restore' ? null : 'restore')}>Show the brief</button>
				{/if}
				<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'impact'} onclick={toggleImpact}>Impact analysis</button>
			</div>
		</div>
	{/if}

	{#if open === 'impact'}
		<DriftImpactPanel impact={change.impact} ready={analysed} />
	{:else if open === 'restore'}
		<DriftRestorePanel bind:brief={() => edit ?? change.prompt, (v) => (edit = v)} canReject={!decision && review.canWrite} {busy} onReject={reject} onClose={() => (open = null)} />
	{/if}
</section>
