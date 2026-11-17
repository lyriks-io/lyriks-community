<script lang="ts">
	import { goto } from '$app/navigation';
	import { relaunchQuestion } from '$domain/retrospec';
	import { confirmDialog } from '$ui/design-system';
	import { sendRetrospecActs } from '$ui/retrospec/review.svelte';
	import PageFrame from '$ui/shell/PageFrame.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SummaryBar from '$ui/spec360/page/SummaryBar.svelte';
	import { BTN_MAIN, CARD } from '$ui/spec360/page/look';
	import { timeAgo } from '$ui/shell/notification-view';
	import DriftChangeCard from '$ui/spec360/drift/DriftChangeCard.svelte';
	import SpecEditCard from '$ui/spec360/drift/SpecEditCard.svelte';
	import MismatchRunReport from '$ui/spec360/drift/MismatchRunReport.svelte';
	import MismatchHistory from '$ui/spec360/drift/MismatchHistory.svelte';
	import { DriftReview } from '$ui/spec360/drift/drift-review.svelte';
	import SectionWaiting from '$ui/shell/SectionWaiting.svelte';
	import { sectionWait } from '$ui/shell/section-wait';
	import type { PageData } from './$types';

	/**
	 * Code drift (criterion 4e7ec88c): the changes found in the code that went
	 * through neither the Specification 360° nor an evolution. For each one the
	 * gap, its impact read from the spec, and the decision: accept it into the
	 * spec, or reject it and restore the previous behaviour. Then, under Changed
	 * in the specification, the changes made by hand in the validated spec, each
	 * read against the code by the next retrospecification (criterion 68b978c4).
	 * The code is only followed once the spec is validated; before, the page says so.
	 * While a later Reverse-Specification is not validated, the page is its report
	 * (criterion f61f8c94). Once the last run is validated the page launches the
	 * next analysis (criterion c350fed7), and an administrator reads the history
	 * of what was done here (criterion 64d191d6).
	 */
	let { data }: { data: PageData } = $props();
	const drift = $derived(data.drift);
	const review = new DriftReview(() => ({ projectId: data.projectId, canWrite: data.canWrite, me: 'You', changes: data.drift.changes }));
	const counts = $derived(review.counts);
	const specHref = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	// Before the specification is validated the entry still opens, and says why it is empty (criterion 6213ef4c).
	const wait = $derived(sectionWait('mismatch', data.chrome.tabs, data.projectId));
	// Mismatch is an entry of its own in the navigation (criterion 097c4079).
	const lead = $derived(
		drift.state === 'report' ? `What the last Reverse-Specification of ${drift.productName} found, compared with its specification.` : `Changes found in the code of ${drift.productName} that went through neither the spec nor an evolution. For each one: look at the gap, ask for an impact analysis, then accept it into the spec or reject it and restore the previous behaviour.`
	);
	const offer = $derived(data.canWrite ? drift.next : null);
	let launching = $state(false);
	/** The same question and the same step as Relaunch the analysis: what the run reads can still be changed there. */
	async function launchAnalysis() {
		if (!offer || !(await confirmDialog({ ...relaunchQuestion(offer.reads), confirmLabel: 'Launch' }))) return;
		launching = true;
		if (await sendRetrospecActs(data.projectId, [{ op: 'start', mode: 'repo' }], 'Launching the analysis')) await goto(`/projects/${encodeURIComponent(data.projectId)}/retrospec`);
		launching = false;
	}
</script>

{#snippet launchTool()}
	<button type="button" class={BTN_MAIN} disabled={launching} onclick={() => void launchAnalysis()} data-launch-analysis>{offer?.scope === 'whole' ? 'Launch a full analysis' : 'Launch a delta analysis'}</button>
{/snippet}

<svelte:head><title>Mismatch · {drift.productName}</title></svelte:head>

<PageFrame wide>
	{#if wait}
		<SectionWaiting title="Mismatch" {wait} />
	{:else}
	<div class="flex flex-col font-evo text-ink">
		<PageHead kicker="Follow-up" title="Mismatch" {lead} tools={offer ? launchTool : undefined} />

		{#snippet compared()}
			{#if drift.version}Compared with the spec of version <span class="font-evo-mono">{drift.version}</span>{:else}Compared with the validated spec{/if}{drift.lastSyncAt
				? ` · code checked ${timeAgo(drift.lastSyncAt)}`
				: ''}
		{/snippet}

		{#if drift.report}
			<MismatchRunReport projectId={data.projectId} report={drift.report} canWrite={data.canWrite} />
		{:else if drift.state === 'draft'}
			<div class="{CARD} animate-lk-in mt-[22px] text-center">
				<b class="mb-1 block text-[0.9375rem] text-ink">The code is followed once the spec is validated</b>
				<p class="m-0 text-sm text-ink-2">
					The specification of {drift.productName} is still a draft. Once the team validates it definitively in Knowledge, every change made in the code outside the spec and the evolutions shows here.
				</p>
				<a href={specHref} class="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-ink no-underline hover:underline">Open Knowledge →</a>
			</div>
		{:else if drift.changes.length === 0 && drift.specEdits.length > 0}
			<!-- Nothing changed in the code: only the edits made by hand are listed below. -->
		{:else if drift.changes.length === 0}
			<div class="{CARD} animate-lk-in mt-[22px] px-5 py-7 text-center">
				{#if drift.followed === 0}
					<b class="mb-1 block text-[0.9375rem] text-ink">Nothing to compare yet</b>
					<p class="m-0 text-sm text-ink-2">
						When the spec of {drift.productName} was validated, its code was not located yet: Lyriks has no reading of the code to compare it with. The code an evolution brings is followed from its merge.
					</p>
				{:else}
					<b class="mb-1 block text-[0.9375rem] text-ink">No drift detected</b>
					<p class="m-0 text-sm text-ink-2">The code of {drift.productName} matches its specification.</p>
					<p class="m-0 mt-2 font-evo-mono text-[0.8125rem] text-ink-3">{@render compared()}</p>
				{/if}
			</div>
		{:else}
			<div class="{CARD} animate-lk-in mt-[22px]">
				<div class="flex flex-wrap items-center gap-[22px]">
					<div>
						<div class="text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] text-ink">{counts.pending}</div>
						<div class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">to review, of {counts.total}</div>
					</div>
					<SummaryBar
						total={counts.total}
						segments={[
							{ value: counts.accepted, color: 'var(--color-green)', label: 'accepted into the spec' },
							{ value: counts.rejected, color: 'var(--color-ink-3)', label: 'rejected' }
						]}
						rest={{ value: counts.pending, label: 'to review' }}
					/>
					<div class="flex-[1_1_200px] font-evo-mono text-[0.8125rem] text-ink-3">{@render compared()}</div>
				</div>
			</div>
			{#each drift.changes as change (change.key)}
				<DriftChangeCard projectId={data.projectId} {change} {review} />
			{/each}
		{/if}

		{#if drift.state === 'validated' && drift.specEdits.length > 0}
			<section class="mt-9" aria-labelledby="changed-in-spec">
				<h2 id="changed-in-spec" class="m-0 text-xl font-bold tracking-[-0.02em] text-ink">Changed in the specification</h2>
				<p class="m-0 mt-1 text-sm text-ink-2">
					Changed by hand in the validated spec. The next Reverse-Specification reads the code against each one: what the code already says closes by itself, what it says otherwise is decided here.
				</p>
				{#each drift.specEdits as edit (edit.itemId)}
					<SpecEditCard projectId={data.projectId} {edit} canWrite={data.canWrite} />
				{/each}
			</section>
		{/if}

		{#if data.history}
			<MismatchHistory lines={data.history} />
		{/if}
	</div>
	{/if}
</PageFrame>
