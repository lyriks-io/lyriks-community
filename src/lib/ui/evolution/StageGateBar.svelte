<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { openWaiver, type EvolutionRequest, type Guarded } from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * The band at the foot of a stage: what the threshold is, the crossing when it
	 * is met, and the named waiver when it is not.
	 *
	 * The refusal is not hidden. When the gate is closed the reason is printed
	 * here, with the waiver offered beside it, because a request that stalls
	 * silently is exactly what this band exists to prevent.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		/** The gate for the next stage: `ok` or the reason it is closed. */
		gate: Guarded;
		/** What crossing this gate does, in the reader's words. */
		label: string;
		onCross: () => void;
	}
	let { store, request, gate, label, onCross }: Props = $props();

	let waiving = $state(false);
	let reason = $state('');
	const standing = $derived(openWaiver(request));

	function grantWaiver() {
		if (store.waive(request.id, reason)) {
			reason = '';
			waiving = false;
		}
	}
</script>

<div class="rounded-card border {gate.ok ? 'border-success-200 bg-success-50/40' : 'border-warning-200 bg-warning-50/40'} p-4">
	{#if standing}
		<!-- The exception announces itself until an admin lifts it. -->
		<div class="mb-3 flex flex-wrap items-start gap-2 rounded-field border border-accent-200 bg-accent-50/60 px-3 py-2">
			<Icon name="flag" size={14} class="mt-0.5 shrink-0 text-accent-600" />
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-accent-700">
					Gate crossed on a waiver
				</p>
				<p class="mt-0.5 text-xs text-ink-700">{standing.reason}</p>
				<p class="mt-0.5 text-[10px] text-ink-400">
					Granted by {standing.grantedBy} on {standing.grantedAt.slice(0, 10)}
				</p>
			</div>
			<Button variant="outline" size="sm" onclick={() => store.liftWaiver(request.id)}>
				Lift waiver
			</Button>
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
				<Icon name={gate.ok ? 'check' : 'lock'} size={14} class={gate.ok ? 'text-success-600' : 'text-warning-600'} />
				{label}
			</p>
			{#if !gate.ok}
				<p class="mt-0.5 text-xs text-warning-700">{gate.reason}</p>
				<p class="mt-0.5 text-[11px] text-ink-500">{gate.detail}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if !gate.ok}
				<Button variant="outline" size="sm" onclick={() => (waiving = !waiving)}>
					<Icon name="flag" size={13} /> Waive the gate
				</Button>
			{/if}
			<Button size="sm" disabled={!gate.ok} onclick={onCross}>
				Cross <Icon name="arrow-right" size={13} />
			</Button>
		</div>
	</div>

	{#if waiving}
		<!-- Crossing early stays possible and stays expensive: the reason is required. -->
		<div class="mt-3 space-y-2 rounded-field border border-line bg-surface p-3">
			<label class="block">
				<span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">
					Why cross a gate that is not met
				</span>
				<textarea
					bind:value={reason}
					rows="2"
					placeholder="Ship the read-only report first; the two minor semantic findings are tracked for v1.1."
					class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-400"
				></textarea>
			</label>
			<p class="text-[11px] text-ink-500">
				A waiver without a reason is indistinguishable from an oversight, so it stays visible on the
				dossier and on the board card until an admin lifts it.
			</p>
			<div class="flex items-center gap-2">
				<Button size="sm" onclick={grantWaiver}>Grant the waiver</Button>
				<button
					type="button"
					class="text-xs text-ink-500 hover:text-ink-800"
					onclick={() => (waiving = false)}>Cancel</button
				>
			</div>
		</div>
	{/if}
</div>
