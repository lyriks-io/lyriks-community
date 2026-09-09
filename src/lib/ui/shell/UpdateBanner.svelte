<script lang="ts">
	/**
	 * Operator notice that a newer appliance release exists.
	 *
	 * Deliberately NOT an "Update now" button: applying an update would require the
	 * platform container to drive Docker, and mounting the Docker socket into an
	 * internet-facing app is exactly the hole an appliance audit looks for. So this
	 * tells the operator the one command to run on the host and gets out of the way.
	 *
	 * Fetched after mount rather than in the layout load, so a slow or unreachable
	 * registry can never delay a page render. Renders nothing unless an update is
	 * actually available — on the air-gapped default the status is always `unknown`.
	 */
	import { onMount } from 'svelte';
	import { Icon } from '$ui/design-system';
	import type { UpdateStatus } from '$domain/updates';

	const UPDATE_COMMAND = './lyriks update';

	let status = $state<UpdateStatus | null>(null);
	let dismissed = $state(false);
	let copied = $state(false);

	/** Dismissal is per-version: a later release speaks up again. */
	const storageKey = $derived(status?.latest ? `lyriks.update.dismissed.${status.latest}` : '');
	const show = $derived(status?.state === 'available' && !dismissed);

	onMount(async () => {
		try {
			const res = await fetch('/api/updates');
			if (!res.ok) return; // non-admin (403) or check unavailable: stay silent
			const body = (await res.json()) as UpdateStatus;
			status = body;
			if (body.latest && localStorage.getItem(`lyriks.update.dismissed.${body.latest}`)) {
				dismissed = true;
			}
		} catch {
			// Never let an advisory check surface an error to the operator.
		}
	});

	function dismiss() {
		dismissed = true;
		if (storageKey) localStorage.setItem(storageKey, '1');
	}

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(UPDATE_COMMAND);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard blocked (insecure origin): the command is on screen anyway.
		}
	}
</script>

{#if show && status}
	<div
		class="flex items-center gap-3 border-b border-brand-500/25 bg-brand-500/10 px-4 py-2 text-sm text-ink-900"
		role="status"
	>
		<Icon name="bolt" size={15} />
		<p class="flex-1">
			<span class="font-semibold">Lyriks {status.latest} is available</span>
			<span class="text-ink-700"> - this install runs {status.current}.</span>
		</p>
		<code class="rounded bg-white/60 px-2 py-1 text-xs font-semibold text-ink-900">
			{UPDATE_COMMAND}
		</code>
		<button
			type="button"
			class="rounded-pill border border-brand-500/40 px-2.5 py-1 text-xs font-semibold text-brand-600 hover:bg-white/50"
			onclick={copyCommand}
		>
			{copied ? 'Copied' : 'Copy'}
		</button>
		<button
			type="button"
			class="rounded p-1 text-ink-500 hover:text-ink-900"
			aria-label="Dismiss update notice"
			onclick={dismiss}
		>
			<Icon name="x" size={14} />
		</button>
	</div>
{/if}
