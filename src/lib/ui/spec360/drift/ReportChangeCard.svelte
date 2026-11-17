<script lang="ts">
	import { COMMENT_MAX_LENGTH, specElementHref, type ChangeVerdict, type ReportCard } from '$domain/retrospec';
	import { timeAgo } from '$ui/shell/notification-view';
	import { BTN, BTN_MAIN, LABEL, LINK } from '../page/look';

	/**
	 * One change a later run found (criterion 42311513), docked on the
	 * specification as it reads today: what it says now on the left, what the run
	 * found on the right. Validate puts it in the specification when what is
	 * validated is written, Revert leaves the specification and asks the code to
	 * go back, Reject says what must change before it goes into the specification
	 * (criterion eb132bbd).
	 */
	interface Props {
		projectId: string;
		card: ReportCard;
		/** Who may edit, until the writing started. */
		canDecide: boolean;
		busy: boolean;
		onDecide: (verdict: ChangeVerdict | null, note?: string) => void;
	}
	let { projectId, card, canDecide, busy, onDecide }: Props = $props();

	const KIND = { new: 'New', changed: 'Changed', removed: 'Removed' } as const;
	const KIND_TONE = { new: 'border-blue-ink text-blue-ink', changed: 'border-orange text-orange-ink', removed: 'border-red-ink text-red-ink' } as const;
	const VERDICT = { validated: 'Validated', reverted: 'Revert requested', rejected: 'Rejected, to rework' } as const;
	const VERDICT_TONE = { validated: 'border-green bg-green text-ink', reverted: 'border-ink text-ink', rejected: 'border-ink-3 text-ink-3' } as const;
	const WARN = BTN.replace('border-evo-ink', 'border-red-ink').replace('text-evo-ink', 'text-red-ink');
	const verdict = $derived(card.decision?.verdict ?? null);
	const TEXT = 'm-0 mt-1.5 text-[0.9375rem] leading-normal text-ink [overflow-wrap:anywhere]';
	const ASKED = 'mt-3 border-[1.5px] border-l-[6px] border-orange bg-orange-tint px-3.5 py-3';

	let rejecting = $state(false);
	let note = $state('');
	function sendRejection(e: SubmitEvent) {
		e.preventDefault();
		if (!note.trim()) return;
		onDecide('rejected', note.trim());
		rejecting = false;
		note = '';
	}
</script>

<article class="mt-4 border-[1.5px] px-5 py-[18px] transition-colors duration-200 max-[700px]:px-4 {verdict === 'validated' ? 'border-green-ink' : 'border-evo-line'} bg-surface" data-report-change={card.id}>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="border-[1.5px] px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {KIND_TONE[card.kind]}">{KIND[card.kind]}</span>
		{#if card.place}<span class="text-sm text-ink-2">{card.place}</span>{/if}
		{#if verdict}
			<span class="ml-auto border-[1.5px] px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] uppercase {VERDICT_TONE[verdict]}">{VERDICT[verdict]}</span>
		{/if}
	</div>
	<h3 class="m-0 mt-2.5 text-lg leading-snug font-bold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{card.title}</h3>
	{#if card.anchor}<a href={specElementHref(projectId, card.anchor)} class="text-sm font-semibold text-blue-ink no-underline hover:underline">See it in the spec</a>{/if}

	<div class="mt-3.5 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-stretch max-[700px]:grid-cols-[minmax(0,1fr)]">
		<div class="border-[1.5px] border-l-[6px] border-green-ink bg-green-tint px-3.5 py-3" data-spec-today>
			<div class="{LABEL} text-green-ink">In the specification today</div>
			{#if card.kind === 'new'}
				<p class={TEXT}>Nothing here yet.</p>
				{#if card.dockedOn}<p class="m-0 mt-1.5 text-sm leading-normal text-ink-2 [overflow-wrap:anywhere]">It would dock on: {card.dockedOn}</p>{/if}
			{:else}
				<p class={TEXT}>{card.current ?? 'No longer found in the specification.'}</p>
			{/if}
		</div>
		<div class="flex items-center justify-center text-ink-2 max-[700px]:py-1.5" aria-hidden="true">
			<svg class="max-[700px]:rotate-90" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg>
		</div>
		<div class="border-[1.5px] border-l-[6px] border-blue-ink bg-paper px-3.5 py-3" data-run-found>
			<div class="{LABEL} text-blue-ink">What the run found</div>
			<p class={TEXT}>{card.kind === 'removed' ? 'No longer in the product.' : card.proposed}</p>
			{#if card.code}<p class="m-0 mt-2 font-evo-mono text-[0.8125rem] leading-normal text-ink-2 [overflow-wrap:anywhere]">{card.code}</p>{/if}
			{#if card.where}<p class="m-0 mt-1 font-evo-mono text-xs text-ink-3 break-all">{card.where}</p>{/if}
		</div>
	</div>

	{#if card.decision?.note}
		<div class={ASKED} data-what-must-change>
			<div class="{LABEL} text-orange-ink">What must change</div>
			<p class={TEXT}>{card.decision.note}</p>
		</div>
	{:else if card.rework && !card.decision}
		<div class={ASKED} data-rework-asked>
			<div class="{LABEL} text-orange-ink">Asked by {card.rework.by.name}, {timeAgo(card.rework.at)}</div>
			<p class={TEXT}>{card.rework.note}</p>
		</div>
	{/if}

	{#if card.decision}
		<div class="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
			<span>{card.decision.by.name}, {timeAgo(card.decision.at)}</span>
			{#if canDecide}<button type="button" class={LINK} disabled={busy} onclick={() => onDecide(null)}>Take it back</button>{/if}
		</div>
	{:else if canDecide && rejecting}
		<form class="mt-3.5 flex flex-col gap-2" onsubmit={sendRejection} data-reject-form>
			<label class="text-sm font-semibold text-ink" for="reject-{card.id}">What must change before it goes into the specification?</label>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea id="reject-{card.id}" class="min-h-[84px] w-full border-[1.5px] border-evo-ink bg-paper px-3 py-2 text-[0.9375rem] leading-normal text-ink" maxlength={COMMENT_MAX_LENGTH} autofocus bind:value={note}></textarea>
			<div class="flex flex-wrap items-center gap-1.5">
				<button type="submit" class="{WARN} max-[700px]:min-h-11" disabled={busy || !note.trim()}>Reject</button>
				<button type="button" class={LINK} onclick={() => (rejecting = false)}>Cancel</button>
			</div>
		</form>
	{:else if canDecide}
		<div class="mt-3.5 flex flex-wrap items-center gap-1.5">
			<button type="button" class="{BTN_MAIN} max-[700px]:min-h-11" disabled={busy} title="It goes into the specification when what is validated is written" onclick={() => onDecide('validated')}>Validate</button>
			<button type="button" class="{BTN} max-[700px]:min-h-11" disabled={busy} title="The code is what is wrong: the specification stays as it is and a brief for your AI is copied" onclick={() => onDecide('reverted')}>Revert</button>
			<button type="button" class="{WARN} max-[700px]:min-h-11" disabled={busy} title="Say what must change before it goes into the specification" onclick={() => (rejecting = true)}>Reject</button>
		</div>
	{/if}
</article>
