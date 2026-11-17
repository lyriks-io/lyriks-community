<script lang="ts">
	import type { NoticedPoint } from '$application/spec360/noticed';
	import { BTN_MAIN, QUIET, STATUS, TAG_VALID } from './page/look';
	import type { FindingDecisions } from './overview/finding-decisions.svelte';

	/**
	 * The decision on a fix waiting for confirmation, the same on its row and in
	 * its drawer (criterion 2a55c3e7): Confirm the fix filled (the issue is
	 * resolved), Reopen quiet (it waits for review again). Who may not edit
	 * reads neither. While the decision is saved, the row says where it went.
	 */
	interface Props {
		point: NoticedPoint;
		decisions: FindingDecisions;
		writable: boolean;
	}
	let { point, decisions, writable }: Props = $props();
	const standing = $derived(decisions.fixStateOf(point));
	const busy = $derived(decisions.busy(point));
	const title = $derived(point.finding.sheet.title || point.finding.text);
</script>

{#if standing === 'confirmed'}
	<span class="{TAG_VALID} animate-lk-in-fast">Fix confirmed</span>
{:else if standing === 'reopened'}
	<span class="{STATUS} animate-lk-in-fast">Back to review</span>
{:else if writable && point.finding.fix}
	<button type="button" class={BTN_MAIN} disabled={busy} aria-label="Confirm the fix: {title}" onclick={() => void decisions.settleFix(point, 'confirmed')}>Confirm the fix</button>
	<button type="button" class="{QUIET} disabled:opacity-40" disabled={busy} aria-label="Reopen: {title}" onclick={() => void decisions.settleFix(point, 'reopened')}>Reopen</button>
{/if}
