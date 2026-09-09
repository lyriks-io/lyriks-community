<script lang="ts">
	import { tick } from 'svelte';
	import Button from './Button.svelte';
	import { pendingDialog, settleDialog } from './dialog.svelte';

	const pending = $derived(pendingDialog());
	let value = $state('');
	let panel = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);

	// Seed the prompt value and move focus into the dialog when it opens.
	$effect(() => {
		if (!pending) return;
		value = pending.request.initial;
		void tick().then(() => (input ?? panel)?.focus());
	});

	// Confirm is armed once the typed-name gate (if any) is satisfied.
	const confirmDisabled = $derived.by(() => {
		if (!pending) return true;
		const req = pending.request;
		if (req.kind === 'prompt') return !value.trim();
		if (req.requireText) return value.trim() !== req.requireText;
		return false;
	});

	function cancel() {
		settleDialog(pending?.request.kind === 'prompt' ? null : false);
	}
	function confirm() {
		if (confirmDisabled) return;
		settleDialog(pending?.request.kind === 'prompt' ? value : true);
	}
</script>

{#if pending}
	{@const req = pending.request}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={panel}
		role="dialog"
		aria-modal="true"
		aria-label={req.title}
		tabindex="-1"
		class="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') cancel();
			if (e.key === 'Enter' && req.kind === 'confirm') confirm();
		}}
	>
		<div
			class="w-full max-w-sm rounded-card border border-line bg-surface p-4 shadow-pop outline-none"
		>
			<p class="text-sm font-semibold text-ink-900">{req.title}</p>
			{#if req.message}
				<p class="mt-1 text-xs leading-snug text-ink-500">{req.message}</p>
			{/if}
			{#if req.kind === 'confirm' && req.requireText}
				<p class="mt-3 text-xs text-ink-500">
					Type <span class="font-semibold text-ink-700">{req.requireText}</span> to confirm:
				</p>
			{/if}
			{#if req.kind === 'prompt' || req.requireText}
				<input
					bind:this={input}
					bind:value
					placeholder={req.placeholder}
					aria-label={req.title}
					onkeydown={(e) => {
						if (e.key === 'Enter') confirm();
					}}
					class="mt-3 w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
				/>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" size="sm" onclick={cancel}>{req.cancelLabel}</Button>
				<Button
					variant={req.danger ? 'danger' : 'primary'}
					size="sm"
					disabled={confirmDisabled}
					onclick={confirm}
				>
					{req.confirmLabel}
				</Button>
			</div>
		</div>
	</div>
{/if}
