<script lang="ts">
	import type { NoticedPoint } from '$application/spec360/noticed';
	import { BTN_MAIN, QUIET, STATUS, TAG_BLUE } from './page/look';
	import type { FindingDecisions } from './overview/finding-decisions.svelte';

	/**
	 * The decision on a point Lyriks noticed, the same on its row and in its
	 * drawer (criterion e0f69b3c): Reject (an issue of the rules register, kept
	 * as it is) and New evolution (a request that names the point) while it waits
	 * for review; then Rejected or Sent to EVO-nnn, naming the request that
	 * carries it (criterion d204c2f2), with Undo. Who may not edit
	 * reads the decision taken, without the buttons. The design's point actions:
	 * Reject quiet beside New evolution filled, Undo quiet.
	 */
	interface Props {
		point: NoticedPoint;
		decisions: FindingDecisions;
		writable: boolean;
		/** In the drawer, New evolution is the main action. */
		main?: boolean;
		/** Several points are picked: they are settled from the bar, and this point's own decisions wait (criterion e241c011). */
		composing?: boolean;
	}
	let { point, decisions, writable, composing = false }: Props = $props();
	const standing = $derived(decisions.stateOf(point));
	const busy = $derived(decisions.busy(point));
	const waiting = $derived(composing ? 'Several points are picked: use the bar at the foot of the screen, or clear the picks.' : undefined);
	const title = $derived(point.finding.sheet.title || point.finding.text);
	// The blue tag of a point an evolution carries; the neutral one (STATUS) is a rejection.
	const SENT = TAG_BLUE;
	/** What the tag says on hover (criterion d204c2f2): the request, its title, the other points it carries. */
	const carriedBy = $derived.by(() => {
		const request = point.request;
		if (!request) return '';
		const named = request.title ? `${request.key}, ${request.title},` : request.key;
		const others = request.others > 0 ? ` with ${request.others} other ${request.others === 1 ? 'point' : 'points'}` : '';
		const frozen = request.undoable ? '' : ' It is frozen: take the point back there.';
		return `${named} carries this point${others}.${frozen} Open it in Evolutions.`;
	});
</script>

{#if standing === 'pending'}
	{#if writable && point.canReject}
		<button type="button" class="{QUIET} disabled:opacity-40" disabled={busy || composing} title={waiting} aria-label="Reject: {title}" onclick={() => void decisions.reject(point)}>Reject</button>
	{/if}
	{#if writable && point.canEvolve}
		<button type="button" class={BTN_MAIN} disabled={busy || composing} title={waiting} aria-label="New change: {title}" onclick={() => void decisions.evolve(point)}>New change</button>
	{/if}
{:else}
	<span class="inline-flex animate-lk-in-fast items-center gap-1">
		{#if standing === 'rejected'}
			<span class={STATUS}>Rejected</span>
		{:else if point.request}
			<a
				href={point.request.href}
				class="{SENT} no-underline hover:underline"
				title={carriedBy}>Sent to {point.request.key}</a
			>
		{:else}
			<span class={SENT}>Sent to Evolutions</span>
		{/if}
		{#if writable && (standing === 'rejected' || point.request?.undoable)}
			<button type="button" class={QUIET} disabled={busy} aria-label="Undo: {title}" onclick={() => void decisions.undo(point)}>Undo</button>
		{/if}
	</span>
{/if}
