<script lang="ts">
	import { pushToast } from '$ui/design-system';
	import { timeAgo } from '$ui/shell/notification-view';
	import { specElementHref } from '$domain/retrospec';
	import type { DriftChangeView } from '$lib/shared/code-drift-page';
	import BlockControls from '$ui/evolution/BlockControls.svelte';
	import RejectCross from '$ui/evolution/RejectCross.svelte';
	import { BTN, BTN_MAIN, LABEL, LINK } from '../page/look';
	import { decidedBox, ownDecisionBox } from './decision-box';
	import type { DriftReview } from './drift-review.svelte';
	import DriftImpactPanel from './DriftImpactPanel.svelte';
	import DriftRestorePanel from './DriftRestorePanel.svelte';

	/**
	 * One code change made outside Lyriks (criteria 4903ceb0, 53e7e3da,
	 * 537e1684): its type, where it belongs and where the code is, what the spec
	 * says beside what the code reads now, then the impact analysis, the
	 * acceptance of the code as it is (the spec's words unchanged), the rejection with the brief that restores the
	 * code, and once decided, the decision with its Undo. A rejected change stays
	 * here, waiting for the code to follow the spec. It is decided as an element of
	 * Knowledge (criteria c53c0474, 857f69d4): the reader's box accepts it, the cross
	 * rejects it; decided, the green box or the filled cross undoes it.
	 */
	interface Props {
		projectId: string;
		change: DriftChangeView;
		review: DriftReview;
		/** The reader's name, for the green box of an acceptance that was theirs (YOU). */
		readerName?: string | null;
	}
	let { projectId, change, review, readerName = null }: Props = $props();

	const decision = $derived(review.decisionOf(change));
	let open = $state<'impact' | 'restore' | null>(null);
	/** The impact was shown once: it opens again without its progress. */
	let analysed = $state(false);
	/** The reader's edit of the brief; until there is one, the brief is the server's. */
	let edit = $state<string | null>(null);
	let busy = $state(false);

	// The design's tags (.ly-tag) in the status hues: a gap orange, a loss red ink, a move neutral.
	const TYPE_TONE = { changed: 'border-orange text-orange-ink', gone: 'border-red-ink text-red-ink', moved: 'border-ink text-ink' } as const;

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
		await run(() => review.accept(change), 'Code change accepted as it is: a new version of the spec records the decision, its words are unchanged');
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
				<!-- The cross opens the restore brief, the reader's box accepts it (criterion c53c0474). -->
				<span class="ml-auto">
					<BlockControls icons small disabled={busy} validate={ownDecisionBox(() => void accept(), { question: "Accept the code change as it is? The spec's words stay unchanged.", act: 'Accept' }, 'You · click to accept')}>
						{#snippet reject()}
							<RejectCross name={change.title} title="Reject it and restore the previous behaviour" expanded={open === 'restore'} disabled={busy} onclick={() => (open = open === 'restore' ? null : 'restore')} />
						{/snippet}
					</BlockControls>
				</span>
			{:else}
				<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'restore'} onclick={() => (open = open === 'restore' ? null : 'restore')}>Show the brief</button>
				<span class="text-[0.8125rem] text-ink-3">A project editor accepts or rejects it.</span>
			{/if}
		</div>
	{:else}
		<div class="animate-lk-in-fast mt-3">
			<p class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]">
				{#if decision.decision === 'kept'}
					Accepted as it is in the code{decision.version ? ` (version ${decision.version} captured)` : ''}: {codeNow}. The spec's words are unchanged.
				{:else}
					Waiting for the code to follow the spec: this change leaves the list once the code reads as the spec again.
				{/if}
				<span class="whitespace-nowrap">· {decision.by}, {timeAgo(decision.at)}</span>
			</p>
			<div class="mt-1 -ml-1 flex flex-wrap items-center gap-x-2">
				{#if decision.decision === 'sent_back'}
					<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'restore'} onclick={() => (open = open === 'restore' ? null : 'restore')}>Show the brief</button>
				{/if}
				<button type="button" class="{LINK} max-[700px]:min-h-11" aria-expanded={open === 'impact'} onclick={toggleImpact}>Impact analysis</button>
				<!-- Decided, the act that took it undoes it (criterion 857f69d4). -->
				<span class="ml-auto inline-flex">
					{#if decision.decision === 'kept'}
						<BlockControls icons small disabled={busy} validate={decidedBox(decision.by, readerName, review.canWrite ? undo : null, { question: 'Undo the acceptance? The version it captured stays in the history.', act: 'Undo' }, 'accepted')} />
					{:else}
						<RejectCross name={change.title} rejected title="Rejected" restoreWord="Undo the rejection of" restoreTitle={review.canWrite ? 'Undo: the change reads to review again' : undefined} disabled={busy} onclick={review.canWrite ? undo : null} />
					{/if}
				</span>
			</div>
		</div>
	{/if}

	{#if open === 'impact'}
		<DriftImpactPanel impact={change.impact} ready={analysed} />
	{:else if open === 'restore'}
		<DriftRestorePanel bind:brief={() => edit ?? change.prompt, (v) => (edit = v)} canReject={!decision && review.canWrite} {busy} onReject={reject} onClose={() => (open = null)} />
	{/if}
</section>
