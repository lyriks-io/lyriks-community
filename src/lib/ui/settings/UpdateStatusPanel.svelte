<script lang="ts">
	/**
	 * Settings, Versions: whether a newer release exists, why none can be offered,
	 * and Check now for an administrator (criteria ea3354b2, 2262b440, dc44978e,
	 * e6554251, a5e298ca, 97c58dfb).
	 *
	 * Advisory only. The platform container has no Docker socket and must never be
	 * given one to update itself, so the most this can do is name the command,
	 * which is also the thing an operator otherwise has to go and look up.
	 */
	import { untrack } from 'svelte';
	import { confirmDialog } from '$ui/design-system';
	import UpdateGuideDialog from '$ui/shell/UpdateGuideDialog.svelte';
	import type { UpdateStatus } from '$domain/updates';

	interface Props {
		/** What the server answered when Settings was loaded. */
		status: UpdateStatus;
		isAdmin: boolean;
		/** The registry the check asks, named in the sentences. */
		registry: string;
	}
	let { status, isAdmin, registry }: Props = $props();

	/** The answer of the last Check now, once there is one; the loaded status before. */
	let checked = $state<UpdateStatus | null>(null);
	const update = $derived(checked ?? status);
	let checking = $state(false);
	let failed = $state(false);
	let guideOpen = $state(false);

	// Last checked, to the second, in the reader's own locale and time zone
	// (criterion 7212cfa5). Drawn once mounted: the server's locale and zone are
	// not the reader's, so rendering it there would not match after hydration.
	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});
	const lastChecked = $derived(
		mounted && update.checkedAt
			? new Date(update.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
			: null
	);

	// A reload (invalidateAll after a Configuration save) brings a fresher status
	// than the last click: it wins.
	$effect(() => {
		void status;
		untrack(() => {
			checked = null;
			failed = false;
		});
	});

	/** Whether the automatic check is off, as the server said when Settings loaded. */
	const automaticOff = $derived(status.reason === 'off');

	/**
	 * Ask past the kept answer. With the automatic check off nothing leaves until
	 * the administrator confirms the dialog that says what does (criterion a5e298ca).
	 */
	async function checkNow() {
		if (automaticOff) {
			const confirmed = await confirmDialog({
				title: 'Check for new versions once?',
				message: `Checking for new versions automatically is off, so this installation asks nothing by itself. To answer, the server asks ${registry} which versions exist, with this installation's pull credentials. Nothing else is sent and nothing is installed. The automatic check stays off, and this check is written to the audit trail.`,
				confirmLabel: 'Ask once',
				cancelLabel: 'Cancel'
			});
			if (!confirmed) return;
		}
		checking = true;
		failed = false;
		try {
			const res = await fetch('/api/updates', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ once: automaticOff })
			});
			if (!res.ok) throw new Error(String(res.status));
			checked = (await res.json()) as UpdateStatus;
		} catch {
			failed = true;
		} finally {
			checking = false;
		}
	}
</script>

<!-- One white band for everything about updates, apart from the component
     rows below it (criterion f8a415b8). -->
<section aria-labelledby="updates-band-title" class="mb-4 space-y-3 border-[1.5px] border-ink bg-paper p-4">
	<p id="updates-band-title" class="m-0 font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Updates</p>
	{#if update.state === 'available'}
		<p class="m-0 border-l-[6px] border-blue bg-blue-tint px-3 py-2 text-sm font-semibold text-ink-900">
			Version {update.latest} is available<span class="font-normal text-ink-500">, you are on {update.current}</span>
		</p>
	{/if}
	<div class="flex items-start gap-3">
		<p class="flex-1 text-xs text-ink-2" role="status">
			{#if update.state === 'current'}
				<span class="font-medium text-green-ink">Up to date: {update.current} is the newest published release.</span>
			{:else if update.reason === 'off'}
				Checking for new versions automatically is off: nothing is asked by itself. Check now asks once, after you
				confirm.
			{:else if update.reason === 'release_unknown'}
				This installation runs a moving tag and no release was recorded at install, so there is nothing to compare a
				new version with.
			{:else if update.reason === 'no_answer'}
				No answer could be read from {registry}. The server must be able to reach it, and a private registry needs
				LYRIKS_REGISTRY_USERNAME and LYRIKS_REGISTRY_PASSWORD in the appliance's .env (a docker login on the host is
				not seen by Lyriks).
			{:else if update.reason === 'no_release'}
				{registry} answered but holds no release of the kind this installation runs ({update.current}).
			{/if}
		</p>
		<!-- The update guide is offered whatever the check answered (criterion ea3354b2). -->
		<button
			type="button"
			onclick={() => (guideOpen = true)}
			class="pressable shrink-0 border-[1.5px] border-ink bg-ink px-3 py-1.5 text-xs font-bold tracking-[0.07em] text-paper uppercase"
		>
			How to update
		</button>
		<!-- Always there for an administrator (criterion e6554251); with the
		     automatic check off it confirms first and asks once. -->
		{#if isAdmin}
			<button
				type="button"
				onclick={checkNow}
				disabled={checking}
				class="pressable shrink-0 border-[1.5px] border-ink px-3 py-1.5 text-xs font-bold tracking-[0.07em] text-ink uppercase disabled:opacity-60"
			>
				{checking ? 'Checking…' : 'Check now'}
			</button>
		{/if}
	</div>
	{#if lastChecked}
		<p class="m-0 font-evo-mono text-xs text-ink-3" data-testid="update-last-checked">Last checked {lastChecked}</p>
	{/if}
	{#if failed}
		<p class="text-xs font-medium text-red-ink" role="alert">Couldn’t check. Please try again.</p>
	{/if}
</section>

{#if guideOpen}
	<UpdateGuideDialog
		latest={update.state === 'available' ? update.latest : undefined}
		current={update.current}
		onClose={() => (guideOpen = false)}
	/>
{/if}
