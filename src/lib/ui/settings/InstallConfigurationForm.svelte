<script lang="ts">
	import { untrack } from 'svelte';
	import { ToggleTile } from '$ui/design-system';
	import { GENERATED_LANGUAGES, LANGUAGE_NAMES } from '$domain/language';
	import type { InstallChoices } from '$domain/settings';

	/**
	 * The configuration of the installation (action 8b4118e5): the same form on the
	 * first configuration, right after the password, and in Settings at any time.
	 */
	interface Props {
		choices: InstallChoices;
		destinations: { readonly updateRegistry: string; readonly feedback: string };
		assistantEnabled: boolean;
		canEdit: boolean;
		submitLabel: string;
		/** The check is on and nothing could be read from the registry (criterion 2a9f386b). */
		noUpdateAnswer?: boolean;
		onSaved?: () => void | Promise<void>;
	}
	let { choices, destinations, assistantEnabled, canEdit, submitLabel, noUpdateAnswer = false, onSaved }: Props = $props();

	let updateCheck = $state(untrack(() => choices.updateCheck));
	let feedbackOnline = $state(untrack(() => choices.feedbackOnline));
	let onlineHelp = $state(untrack(() => choices.onlineHelp));
	let specLanguage = $state(untrack(() => choices.specLanguage));
	let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	const LANGUAGES = Object.entries(LANGUAGE_NAMES);
	const generatedInEnglish = $derived(!(GENERATED_LANGUAGES as readonly string[]).includes(specLanguage));

	async function save() {
		status = 'saving';
		try {
			const res = await fetch('/api/install-configuration', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ updateCheck, feedbackOnline, onlineHelp, specLanguage })
			});
			if (!res.ok) throw new Error(String(res.status));
			await onSaved?.();
			status = 'saved';
		} catch {
			status = 'error';
		}
	}
</script>

<fieldset disabled={!canEdit} class="min-w-0 space-y-6 disabled:opacity-70">
	<div class="space-y-2">
		<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Language of the specifications</p>
		<div class="flex flex-wrap gap-1.5">
			{#each LANGUAGES as [code, name] (code)}
				<button
					type="button"
					aria-pressed={specLanguage === code}
					onclick={() => (specLanguage = code)}
					class="border-[1.5px] px-2.5 py-1 text-xs font-medium transition {specLanguage === code
						? 'border-ink bg-ink text-paper'
						: 'border-line bg-paper text-ink hover:border-ink'}"
				>
					{name}
				</button>
			{/each}
		</div>
		<p class="text-xs text-ink-2">
			New projects start in this language, and your AI writes their specification in it. A project can declare
			another one, and existing projects keep theirs.
			{#if generatedInEnglish}
				The texts Lyriks generates itself (requirements, scenarios) stay in English for this language.
			{/if}
		</p>
	</div>

	<div class="space-y-2">
		<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">What may leave this installation</p>
		<ToggleTile
			title="Check for new versions"
			hint="The server asks {destinations.updateRegistry} which versions exist, at most every six hours, with this installation's pull credentials and nothing else. It installs nothing: administrators are told the command to run."
			selected={updateCheck}
			onToggle={() => (updateCheck = !updateCheck)}
		/>
		{#if noUpdateAnswer}
			<p class="text-xs text-ink-2" role="status">
				No answer could be read from {destinations.updateRegistry}. The server must be able to reach it, a private
				registry needs its pull credentials on the host, and the running release must be known.
			</p>
		{/if}
		{#if destinations.feedback}
			<ToggleTile
				title="Offer online feedback"
				hint="Someone who chooses it sends their notes from their own browser to {destinations.feedback}, only when they press Send. Without it, feedback leaves through their email app, or by copy."
				selected={feedbackOnline}
				onToggle={() => (feedbackOnline = !feedbackOnline)}
			/>
		{/if}
		<ToggleTile
			title="Show links outside this installation"
			hint="The full guide on get.lyriks.io opens in a new tab when someone clicks it; the address of this installation stays in the part of the link that is never sent to a server. Without it these links are not shown, and the First steps inside the product stay."
			selected={onlineHelp}
			onToggle={() => (onlineHelp = !onlineHelp)}
		/>
		<p class="text-xs text-ink-2">
			The built-in AI assistant is {assistantEnabled ? 'on' : 'off'}. It needs your own API key, and is connected
			in Settings, AI assistant.
		</p>
	</div>

	<div class="flex items-center gap-3">
		<button
			type="button"
			onclick={save}
			disabled={status === 'saving'}
			class="pressable border-[1.5px] border-ink bg-ink px-3 py-2 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-60"
		>
			{submitLabel}
		</button>
		{#if status === 'saving'}
			<span class="text-xs font-medium text-ink-500">Saving…</span>
		{:else if status === 'saved'}
			<span class="text-xs font-medium text-green-ink">Saved.</span>
		{:else if status === 'error'}
			<span class="text-xs font-medium text-red-ink" role="alert">Couldn’t save. Please try again.</span>
		{/if}
	</div>
</fieldset>
{#if !canEdit}
	<p class="mt-2 text-xs text-ink-500">Only an administrator can change this.</p>
{/if}
