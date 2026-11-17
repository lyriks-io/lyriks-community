<script lang="ts">
	import { untrack } from 'svelte';
	import { ToggleTile } from '$ui/design-system';
	import type { ProofSettingsView } from '$application/operations/proof-settings';

	/**
	 * Settings, Proofs (feature 157, surface 7c01c470): whether the installation
	 * proves rules with the solver, off on a new installation, and the machine it
	 * would run on, with the suggestion of a larger one when it falls short.
	 */
	interface Props {
		initial: ProofSettingsView;
		isAdmin: boolean;
	}
	let { initial, isAdmin }: Props = $props();

	let view = $state(untrack(() => initial));
	let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let refusal = $state('');

	const switchable = $derived(isAdmin && view.allowed && !view.operatorTurnedOff);

	async function toggle() {
		if (!switchable || status === 'saving') return;
		status = 'saving';
		const res = await fetch('/api/settings/proofs', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ on: !view.on })
		}).catch(() => null);
		const body = res ? await res.json().catch(() => ({})) : {};
		if (res?.ok && body.proofs) {
			view = body.proofs;
			status = 'saved';
		} else {
			refusal = body.refusal ?? 'Couldn’t save.';
			status = 'error';
		}
	}
</script>

{#if !view.allowed}
	<p class="text-xs text-ink-500" data-testid="proofs-locked">
		Proving a rule for every value is part of Enterprise. This installation runs no solver.
	</p>
{:else}
	<p class="text-xs text-ink-500">
		The solver proves each rule for every value at once. It runs on this machine beside the pages, so it is off until an
		administrator turns it on. The engine restarts on its own with or without it: no restart of the installation.
	</p>

	{#if view.advice}
		<div class="flex flex-col gap-1 text-xs" data-testid="proofs-machine">
			<span class="text-ink-700">{view.advice.reads}</span>
			{#if view.advice.suggestion}
				<span class="font-medium text-orange-ink">{view.advice.suggestion}</span>
			{/if}
		</div>
	{/if}

	{#if switchable}
		<ToggleTile
			title={view.on ? 'Prove rules with the solver: on' : 'Prove rules with the solver: off'}
			hint={view.on
				? 'Rules read their verdict beside them. Turn off to give the machine back to the pages.'
				: 'Rules read Not checked. Turn on to prove them for every value.'}
			selected={view.on}
			onToggle={toggle}
		/>
	{:else}
		<p class="text-sm font-semibold text-ink-700">Prove rules with the solver: {view.on ? 'on' : 'off'}</p>
	{/if}

	<div class="flex items-center gap-3">
		{#if view.operatorTurnedOff}
			<span class="text-xs text-ink-500">The solver is turned off in this installation’s environment (UNSPA_SOLVER=off): remove it there first.</span>
		{:else if !isAdmin}
			<span class="text-xs text-ink-500">Only an administrator turns proofs on or off.</span>
		{:else if status === 'saving'}
			<span class="text-xs font-medium text-ink-500">Saving…</span>
		{:else if status === 'saved'}
			<span class="text-xs font-medium text-green-ink">Saved.</span>
		{:else if status === 'error'}
			<span class="text-xs font-medium text-red-ink">{refusal}</span>
		{/if}
	</div>
{/if}
