<script lang="ts">
	import { enhance } from '$app/forms';
	import { extractLicenseKey } from '$domain/licensing';
	import { Icon, Logo } from '$ui/design-system';
	import LicenseCard from '$ui/licensing/LicenseCard.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
	let dragging = $state(false);
	let dropError = $state<string | null>(null);
	let keyField = $state<HTMLTextAreaElement>();
	let activateForm = $state<HTMLFormElement>();

	const REASONS: Record<string, string> = {
		empty: 'Enter a licence key.',
		invalid: 'That key is not valid for this build - check for copy/paste errors.',
		retired:
			'This key was issued under a signing key we have since retired, so it can no longer be activated. The key itself is genuine - ask us for a replacement and your entitlements carry over.',
		expired: 'That licence has expired. Contact sales for a renewal key.',
		tampered: 'The system clock is set in the past. Correct the machine date and time, then activate.',
		wrong_edition:
			'That key is genuine, but it was issued for a lower edition than this installation runs. Use the key issued for this edition, or install the edition your key covers.'
	};

	const RESTORE_REASONS: Record<string, string> = {
		none: 'There is no previous key on this install.',
		invalid: 'The previous key no longer verifies against this build.',
		expired: 'The previous key has expired, so going back would leave this install walled.',
		tampered: 'The system clock is set in the past. Correct the machine date and time first.',
		wrong_edition: 'The previous key does not cover the edition this install runs.'
	};

	let isActive = $derived(data.license.status === 'active');
	// Replacing a key on a WORKING install used to mean removing the working key
	// first: the entry form was hidden while active, and the only affordance on
	// screen was "remove the stored key". So the safe moment to discover that a
	// renewal is wrong was after destroying the thing it replaces. The form is
	// now reachable while active, and what it submits first is a dry run.
	let replacing = $state(false);
	let previewed = $derived(form && 'preview' in form ? form.preview : null);
	let previewedKey = $derived(form && 'key' in form ? String(form.key) : '');
	let isCommunity = $derived(data.installEdition === 'community');
	let copied = $state(false);

	// The registration code never leaves this machine on its own: the operator
	// copies it and decides whether to paste it into their account on lyriks.io.
	async function copyRegistrationCode() {
		if (!data.registrationCode) return;
		try {
			await navigator.clipboard.writeText(data.registrationCode);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard denied (insecure origin, browser policy): the code is on
			// screen and selectable, so there is nothing to recover from.
		}
	}
	// A stored-but-unusable key (expired/invalid) can be replaced or removed.
	let hasStoredKey = $derived(data.license.status !== 'unlicensed');

	// Drop-to-activate: the key arrives by email as a small text/`.lyrkey` attachment.
	// We read it in the browser, pull the `lyk_…` token out (extraction is pure domain,
	// and nothing leaves the machine), fill the field and submit — same offline path as
	// a manual paste, just without the copy/paste step. The verifier stays the sole
	// authority on validity; a shape-less file is rejected here before any submit.
	async function ingestFile(file: File) {
		dropError = null;
		const key = extractLicenseKey(await file.text());
		if (!key) {
			dropError = `No licence key found in "${file.name}". Drop the key file from your email, or paste the key below.`;
			return;
		}
		if (keyField) keyField.value = key;
		activateForm?.requestSubmit();
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void ingestFile(file);
	}

	function onFilePick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) void ingestFile(file);
	}
</script>

<div class="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
	<div class="mb-8 flex items-center gap-3">
		<Logo />
		<div>
			<h1 class="text-xl font-bold text-ink-900">Activate Lyriks</h1>
			<p class="text-xs text-ink-500">
				Offline activation - your key is verified locally, nothing leaves this machine.
			</p>
		</div>
	</div>

	<section class="space-y-5 rounded-card border border-line bg-surface p-6 shadow-card">
		<LicenseCard view={data.license} />

		{#if !isActive || replacing}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				role="group"
				aria-label="Activate by dropping your licence file"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				class="space-y-3 rounded-card border-2 border-dashed border-t border-line pt-5 transition-colors {dragging
					? 'border-brand-400 bg-brand-50'
					: ''}"
			>
				<div
					class="flex flex-col items-center gap-1 py-2 text-center text-ink-400"
					class:pointer-events-none={dragging}
				>
					<Icon name="upload" size={18} />
					<p class="text-xs">
						Drop the licence file from your email here, or
						<label class="cursor-pointer font-medium text-brand-600 hover:text-brand-700">
							browse
							<input type="file" class="sr-only" onchange={onFilePick} />
						</label>
					</p>
				</div>

				{#if dropError}
					<p class="flex items-center gap-1.5 text-xs font-medium text-danger-500">
						<Icon name="info" size={13} />
						{dropError}
					</p>
				{/if}

				<form
					bind:this={activateForm}
					method="POST"
					action="?/preview"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
					class="space-y-3"
				>
					<div>
						<label
							for="key"
							class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
						>
							…or paste your {isCommunity ? 'Community' : 'licence'} key
						</label>
						<textarea
							bind:this={keyField}
							id="key"
							name="key"
							rows="3"
							placeholder="lyk_…"
							spellcheck="false"
							autocomplete="off"
							class="w-full resize-none rounded-field border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-900 outline-none focus:border-brand-300"
						></textarea>
					</div>

					{#if form && 'reason' in form && form.reason}
						<p class="flex items-center gap-1.5 text-xs font-medium text-danger-500">
							<Icon name="info" size={13} />
							{REASONS[form.reason] ?? 'Activation failed.'}
						</p>
					{/if}

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-field bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
					>
						{submitting ? 'Verifying…' : 'Check this key'}
					</button>
				</form>

				{#if previewed}
					<!-- The verdict, before anything is stored. Same checks the real
					     activation runs, so what is shown here is what will be in
					     force; the operator confirms with the entitlements in view
					     instead of discovering them afterwards. -->
					<div class="space-y-3 rounded-card border border-brand-200 bg-brand-50 p-4">
						<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">
							This key checks out. Here is what it grants:
						</p>
						<LicenseCard view={previewed} />
						<form
							method="POST"
							action="?/activate"
							use:enhance={() => {
								submitting = true;
								return async ({ update }) => {
									await update();
									submitting = false;
								};
							}}
						>
							<input type="hidden" name="key" value={previewedKey} />
							<button
								type="submit"
								disabled={submitting}
								class="w-full rounded-field bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
							>
								{isActive ? 'Use this key instead' : 'Activate with this key'}
							</button>
						</form>
						{#if isActive}
							<p class="text-[11px] leading-relaxed text-ink-500">
								Your current key stays in place until you confirm, and is kept afterwards so you
								can step back to it.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if isActive && !replacing}
			<button
				type="button"
				onclick={() => (replacing = true)}
				class="w-full rounded-field border border-line px-4 py-2 text-sm font-medium text-ink-600 hover:border-brand-300 hover:text-brand-600"
			>
				Replace the licence key
			</button>
		{/if}

		{#if data.hasPreviousKey}
			<!-- The way back. Kept beside the replace affordance rather than hidden
			     in settings: the moment an operator needs it is the moment they just
			     swapped a key and saw something they did not expect. -->
			<form
				method="POST"
				action="?/restorePrevious"
				use:enhance
				class="border-t border-line pt-4"
			>
				{#if form && 'restoreReason' in form && form.restoreReason}
					<p class="mb-2 flex items-center gap-1.5 text-xs font-medium text-danger-500">
						<Icon name="info" size={13} />
						{RESTORE_REASONS[String(form.restoreReason)] ?? 'Could not go back to the previous key.'}
					</p>
				{/if}
				<button type="submit" class="text-xs font-medium text-ink-500 hover:text-brand-600">
					Go back to the previous key
				</button>
			</form>
		{/if}

		{#if isActive && data.registrationCode}
			<!-- Registration: the only way an air-gapped install can be counted. The
			     appliance never reports anything, so the operator carries this code
			     to their account by hand, or does not. Optional on purpose, and said
			     so plainly here rather than implied. -->
			<div class="space-y-2 rounded-card border border-line bg-canvas p-4">
				<div class="flex items-center justify-between gap-3">
					<h3 class="text-xs font-semibold text-ink-900">Register this installation</h3>
					<button
						type="button"
						onclick={copyRegistrationCode}
						class="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1 text-[11px] font-medium text-ink-600 hover:border-brand-300 hover:text-brand-600"
					>
						<Icon name={copied ? 'check' : 'copy'} size={12} />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="select-all font-mono text-sm tracking-wider text-ink-900">
					{data.registrationCode}
				</p>
				<p class="text-[11px] leading-relaxed text-ink-500">
					Optional. Paste this code into your account on lyriks.io so we know your key is running
					{isCommunity ? ' and can keep supporting the Community edition' : ''}. It identifies this
					installation and nothing else, and it is sent only if you paste it yourself: the appliance
					never contacts us.
				</p>
			</div>

			<!-- The way out. Activating through the form above redirects into the
			     product, so this page was only ever seen mid-flow; anyone ARRIVING
			     on it already activated — a bookmark, a headless activation, an
			     admin coming to check the expiry — got a screen with nothing to do
			     next and one destructive link. It cannot simply redirect instead:
			     this is also where the key is inspected and replaced. -->
			<a
				href="/"
				class="block w-full rounded-field bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
			>
				Continue to Lyriks
			</a>
		{/if}

		{#if hasStoredKey}
			<form method="POST" action="?/deactivate" use:enhance class="border-t border-line pt-4">
				<button
					type="submit"
					class="text-xs font-medium text-ink-400 hover:text-danger-500"
				>
					Remove the stored key from this install
				</button>
			</form>
		{/if}
	</section>

	<p class="mt-5 text-center text-[11px] text-ink-400">
		{#if isCommunity}
			No key yet? The Community key is free and never expires - request one at
			<span class="font-medium text-ink-600">get.lyriks.io</span> and it arrives by email.
		{:else}
			No key yet? Purchase a licence at
			<span class="font-medium text-ink-600">lyriks.io</span> - the key arrives by email.
		{/if}
	</p>
</div>
