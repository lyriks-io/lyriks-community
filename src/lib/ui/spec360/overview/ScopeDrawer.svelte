<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ScopeBoundaryView } from '$application/spec360/scope-boundary';
	import { SideDrawer } from '$ui/design-system';
	import { BTN_MAIN, KICK, QUIET } from '../page/look';
	import ScopeBoundary from './ScopeBoundary.svelte';
	import { scopeDay } from './scope-day';

	/**
	 * Scope, opened from the Overview's out of scope link while the list waits
	 * for approval, and from the History of the Reverse page once approved
	 * (criteria 3b04797c, d16b352d, bccbfdb5): where the specification stops,
	 * then its approval. A person who may write the project approves the list as
	 * the drawer shows it (action Approve what the spec leaves out); a reader
	 * reads the line alone.
	 */
	interface Props {
		open: boolean;
		onClose: () => void;
		view: ScopeBoundaryView;
		projectId: string;
		canApprove: boolean;
	}
	let { open, onClose, view, projectId, canApprove }: Props = $props();

	let busy = $state(false);
	let refused = $state('');

	const approval = $derived(view.approval);
	const line = $derived.by(() => {
		if (!approval) return '';
		const on = scopeDay(approval.at);
		if (approval.state === 'current') return `Approved by ${approval.by} on ${on}.`;
		if (approval.state === 'changed') return `Changed since ${approval.by} approved it on ${on}.`;
		return 'Nobody has approved this list yet.';
	});
	const offered = $derived(canApprove && !!approval && approval.state !== 'current');

	async function approve() {
		busy = true;
		refused = '';
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scope/approval`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ shown: view.shown })
			});
			if (!response.ok) {
				const answer = (await response.json().catch(() => null)) as { message?: string } | null;
				refused = `Not approved. ${answer?.message ?? ''}`.trim();
			}
			// Approved, or refused on a list that moved: the drawer reads it as it now stands.
			await invalidateAll();
		} catch {
			refused = 'Not approved. The server could not be reached.';
		} finally {
			busy = false;
		}
	}
</script>

<SideDrawer {open} {onClose} kicker="Where the specification stops" title="Scope" label="Scope: in scope and out of scope">
	<div class="mt-2 grid gap-6">
		<ScopeBoundary {view} />
		{#if approval}
			<div class="grid gap-1.5 border-t border-line pt-3" data-scope-approval={approval.state}>
				<div class={KICK}>Approval</div>
				<p class="m-0 text-[0.875rem] leading-normal text-ink">{line}</p>
				{#if refused}<p class="m-0 text-[0.8125rem] leading-snug text-red-ink" role="alert">{refused}</p>{/if}
			</div>
		{/if}
	</div>
	{#snippet foot()}
		{#if offered}
			<button type="button" class={BTN_MAIN} disabled={busy} onclick={approve}>{approval?.state === 'changed' ? 'Approve again' : 'Approve'}</button>
		{/if}
		<button type="button" class={QUIET} onclick={onClose}>Close</button>
	{/snippet}
</SideDrawer>
