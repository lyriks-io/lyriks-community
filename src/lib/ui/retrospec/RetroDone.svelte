<script lang="ts">
	import { PRIMARY_48, SECONDARY_48 } from '$ui/evolution/evo-look';
	import { dayOf } from './look';

	/**
	 * The specification once published: what the review settled and what is
	 * still pending, where the specification lives from now on, and the run
	 * that produced it, which can be run again when the code moved.
	 */
	interface Props {
		productName: string;
		validated: number;
		rejected: number;
		total: number;
		pending: number;
		publishedAt: string | null;
		publishedBy: string | null;
		codePct: number | null;
		specHref: string;
		canWrite: boolean;
		busy: boolean;
		onPending: () => void;
		onRelaunch: () => void;
	}
	let { productName, validated, rejected, total, pending, publishedAt, publishedBy, codePct, specHref, canWrite, busy, onPending, onRelaunch }: Props = $props();

	const sub = $derived(
		`${validated} ${validated === 1 ? 'item' : 'items'} validated${rejected > 0 ? ` and ${rejected} rejected` : ''} out of ${total}. ` +
			(pending > 0 ? `${pending} ${pending === 1 ? 'point remains' : 'points remain'} pending (to review or shared): they stay flagged until they are validated.` : 'No pending items.')
	);
</script>

<div class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-4">
	<div class="flex flex-col items-center gap-3.5 rounded-2xl border border-evo-green-line bg-surface px-6 py-10 text-center">
		<span aria-hidden="true" class="flex size-14 flex-none animate-lk-pop items-center justify-center bg-evo-green-stroke text-[1.625rem] font-bold text-white">✓</span>
		<h2 class="m-0 text-[1.375rem] leading-tight font-bold">The specification of {productName} is published</h2>
		<span class="max-w-[620px] text-[0.9375rem] leading-normal text-evo-ink-3">{sub}</span>
	</div>
	<div class="flex flex-wrap items-start gap-4 rounded-evo-card border border-evo-line bg-white px-6 py-5">
		<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center rounded-evo-btn bg-evo-violet-soft text-evo-violet-ink">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
		</span>
		<div class="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
			<h3 class="m-0 text-lg font-bold">Everything now lives in Knowledge</h3>
			<span class="text-[0.9375rem] leading-[1.55] text-evo-ink-3">Each validation and comment is kept, with who did it and when, and the published version is kept as a baseline of the specification. From now on, a change to the product can be qualified through an evolution, and Lyriks keeps the history up to date.</span>
			{#if publishedAt}
				<span class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-evo-muted">
					<span>Published {dayOf(publishedAt)}{publishedBy ? ` by ${publishedBy}` : ''}{codePct !== null ? ` · ${codePct} % of the spec found in the code` : ''}</span>
					{#if canWrite}<button type="button" class="font-semibold text-evo-violet-ink underline" disabled={busy} title="Your LLM reads the code again and Lyriks follows what it changes" onclick={onRelaunch}>Run it again</button>{/if}
				</span>
			{/if}
		</div>
	</div>
	<div class="flex flex-wrap justify-end gap-2.5">
		<button type="button" class={SECONDARY_48} onclick={onPending}>View pending items</button>
		<a href={specHref} class={PRIMARY_48}>Open the specification →</a>
	</div>
</div>
