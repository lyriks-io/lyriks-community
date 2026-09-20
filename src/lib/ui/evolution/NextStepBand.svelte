<script lang="ts">
	import { Button, Icon, Textarea } from '$ui/design-system';
	import type { DossierCounts } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';

	/**
	 * The band that moves a request to its next step, or says exactly why it
	 * cannot yet. The refusal is printed, never hidden, with the waiver offered
	 * beside it: a request that stalls silently is what this band prevents.
	 */
	interface Props {
		projectId: string;
		dossier: DossierCounts;
		canEdit: boolean;
		isAdmin: boolean;
	}
	let { projectId, dossier, canEdit, isAdmin }: Props = $props();

	let waiving = $state(false);
	let reason = $state('');
	let busy = $state(false);

	const LABEL: Record<string, string> = {
		coherence: 'the challenge: the idea is settled, the report is read',
		implementation: 'Verify (freezes the spec as a numbered version)',
		acceptance: 'Accept',
		delivered: 'Delivered'
	};
	const next = $derived(dossier.gate.next ? (LABEL[dossier.gate.next] ?? dossier.gate.next) : null);

	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			return await applyEvolution(projectId, [{ requestId: dossier.id, ...op }]);
		} finally {
			busy = false;
		}
	}

	async function waive() {
		if (await run({ op: 'cross_stage', waiverReason: reason })) {
			reason = '';
			waiving = false;
		}
	}
</script>

{#if next}
	<div class="rounded-card border {dossier.gate.ok ? 'border-success-200 bg-success-50/40' : 'border-warning-200 bg-warning-50/40'} p-4">
		{#if dossier.waiver}
			<div class="mb-3 flex flex-wrap items-start gap-2 rounded-field border border-accent-200 bg-accent-50/60 px-3 py-2">
				<Icon name="flag" size={14} class="mt-0.5 shrink-0 text-accent-600" />
				<div class="min-w-0 flex-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-accent-700">Crossed on a waiver</p>
					<p class="mt-0.5 text-xs text-ink-700">{dossier.waiver.reason}</p>
					<p class="mt-0.5 text-[10px] text-ink-400">Granted by {dossier.waiver.grantedBy} on {dossier.waiver.grantedAt.slice(0, 10)}</p>
				</div>
				{#if isAdmin}
					<Button variant="outline" size="sm" disabled={busy} onclick={() => run({ op: 'lift_waiver' })}>Lift waiver</Button>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
					<Icon name={dossier.gate.ok ? 'check' : 'lock'} size={14} class={dossier.gate.ok ? 'text-success-600' : 'text-warning-600'} />
					{dossier.gate.ok ? `Ready to move to ${next}` : (dossier.gate.reason ?? 'Not ready yet')}
				</p>
				{#if !dossier.gate.ok && dossier.gate.detail}
					<p class="mt-0.5 text-xs text-ink-700">{dossier.gate.detail}</p>
				{/if}
			</div>
			{#if canEdit}
				<div class="flex flex-wrap gap-2">
					{#if dossier.gate.ok}
						<Button disabled={busy} onclick={() => run({ op: 'cross_stage' })}>
							Validate and move on
							<Icon name="arrow-right" size={14} />
						</Button>
					{:else if !waiving}
						<Button variant="outline" size="sm" disabled={busy} onclick={() => (waiving = true)}>Cross anyway, with a reason</Button>
					{/if}
					{#if dossier.stage !== 'specification' && dossier.stage !== 'draft' && dossier.stage !== 'delivered'}
						<Button variant="ghost" size="sm" disabled={busy} onclick={() => run({ op: 'rebrief' })}>Back to the idea</Button>
					{/if}
				</div>
			{/if}
		</div>

		{#if waiving}
			<div class="mt-3">
				<Textarea value={reason} rows={2} placeholder="The reason everyone downstream will read until an admin lifts it" oninput={(v) => (reason = v)} />
				<div class="mt-2 flex gap-2">
					<Button size="sm" disabled={busy || reason.trim() === ''} onclick={waive}>Cross with this waiver</Button>
					<Button size="sm" variant="ghost" onclick={() => (waiving = false)}>Cancel</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
