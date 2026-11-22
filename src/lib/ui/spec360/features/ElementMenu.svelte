<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Icon } from '$ui/design-system';
	import type { DisabledMarker } from '$lib/unspa-schema';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { FIELD, LINK, POP, PRESS_FILL, QUIET } from '$ui/spec360/page/look';
	import { disableBatch, menuChoice, refusedLine } from './disable-element';

	/**
	 * The menu of an element of a feature (an action, a rule, an always-true
	 * statement): Disable on one in force, which asks why in one line, Enable on
	 * a disabled one (criterion 6579f7f4). Offered to who may write the
	 * specification only: a viewer is offered nothing (rule e9b2247a).
	 */
	interface Props {
		featureId: string;
		elementId: string;
		/** What the element is called, for the menu's label. */
		title: string;
		disabled?: DisabledMarker | null;
	}
	let { featureId, elementId, title, disabled = null }: Props = $props();
	const validation = useValidation();
	const choice = $derived(menuChoice(disabled));
	let open = $state(false);
	let asking = $state(false);
	let reason = $state('');
	let saving = $state(false);
	let message = $state('');

	function close() {
		open = false;
		asking = false;
		reason = '';
	}

	async function send() {
		if (choice === 'disable' && !reason.trim()) {
			message = refusedLine('disable', 'Say why the element is disabled.');
			return;
		}
		saving = true;
		message = '';
		try {
			const response = await fetch('/api/behavior/apply', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(disableBatch({ projectId: validation.source.projectId, featureId, elementId, choice, reason }))
			});
			const answer = (await response.json().catch(() => null)) as { batch?: { ok?: boolean; errors?: string[] }; message?: string } | null;
			if (!response.ok || answer?.batch?.ok !== true) {
				message = refusedLine(choice, answer?.batch?.errors?.[0] ?? answer?.message ?? '');
				return;
			}
			close();
			await invalidateAll();
		} catch {
			message = refusedLine(choice, 'Check your connection.');
		} finally {
			saving = false;
		}
	}
</script>

{#if validation.source.canWrite}
	<span class="relative inline-flex flex-none">
		<button type="button" class={QUIET} aria-haspopup="menu" aria-expanded={open} aria-label="More for {title}" onclick={() => (open = !open)}>
			<Icon name="ellipsis" size={16} />
		</button>
		{#if open}
			<div role="menu" class="{POP} absolute top-full right-0 z-20 mt-1 flex w-[min(320px,80vw)] flex-col gap-2 p-2.5">
				{#if choice === 'enable'}
					<button type="button" role="menuitem" class={LINK} disabled={saving} onclick={() => void send()}>Enable</button>
				{:else if !asking}
					<button type="button" role="menuitem" class={LINK} onclick={() => (asking = true)}>Disable</button>
				{:else}
					<form class="flex flex-col gap-2" onsubmit={(event) => { event.preventDefault(); void send(); }}>
						<label class="flex flex-col gap-1 text-xs font-semibold">Why disable it?<input bind:value={reason} maxlength="300" required class="{FIELD} p-1.5 text-sm font-normal" placeholder="In one line" /></label>
						<span class="flex justify-end gap-2"><button type="button" class={QUIET} onclick={close}>Cancel</button><button type="submit" class="{PRESS_FILL} px-3 py-1 text-xs" disabled={saving}>{saving ? 'Disabling…' : 'Disable'}</button></span>
					</form>
				{/if}
				{#if message}<p class="m-0 text-xs text-red-ink" role="alert">{message}</p>{/if}
			</div>
		{/if}
	</span>
{/if}
