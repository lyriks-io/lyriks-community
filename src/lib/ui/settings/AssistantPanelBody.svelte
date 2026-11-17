<script lang="ts">
	import { untrack } from 'svelte';
	import { ToggleTile } from '$ui/design-system';
	import { ASSISTANT_PROVIDERS, defaultModelOf, modelOf, offeredModel, providerOf, type AssistantProvider, type AssistantSettings } from '$domain/settings';

	/**
	 * Settings › AI assistant: the built-in assistant, off on a new installation
	 * (ac-adm-ai-off), connected once by an administrator for everybody
	 * (ac-adm-ai-central). The key is written and never read back: the panel
	 * only ever shows its last four characters (ac-adm-ai-key). Someone who is
	 * not an administrator reads where it stands and who changes it
	 * (ac-adm-ai-readonly).
	 */
	interface Props {
		initial: AssistantSettings;
		isAdmin: boolean;
	}
	let { initial, isAdmin }: Props = $props();

	let assistant = $state(untrack(() => ({ ...initial })));
	let provider = $state<AssistantProvider>(untrack(() => initial.provider));
	// The model is one of those offered, or another the provider serves, typed by its name.
	const OTHER = 'other';
	const choiceOf = (s: AssistantSettings) => offeredModel(s.provider, modelOf(s))?.id ?? OTHER;
	let choice = $state(untrack(() => choiceOf(initial)));
	let custom = $state(untrack(() => (choiceOf(initial) === OTHER ? initial.model : '')));
	let apiKey = $state('');
	let status = $state<'idle' | 'saving' | 'testing' | 'saved' | 'error'>('idle');
	let message = $state('');

	const connected = $derived(assistant.keyHint !== null);
	const model = $derived(choice === OTHER ? custom.trim() : choice);
	const changed = $derived(apiKey.trim() !== '' || provider !== assistant.provider || model !== modelOf(assistant));
	const offered = $derived(providerOf(provider).models);
	const picked = $derived(offeredModel(provider, model));
	const shownModel = $derived(modelOf(assistant));
	const shownOffered = $derived(offeredModel(assistant.provider, shownModel));

	function pickProvider(next: AssistantProvider) {
		if (next === provider) return;
		provider = next;
		choice = defaultModelOf(next);
		custom = '';
	}

	async function send(method: 'PUT' | 'DELETE' | 'POST', url: string, body?: unknown): Promise<boolean> {
		try {
			const res = await fetch(url, {
				method,
				headers: body === undefined ? undefined : { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			const answer = (await res.json().catch(() => null)) as { assistant?: AssistantSettings; message?: string } | null;
			if (!res.ok || !answer?.assistant) {
				status = 'error';
				message = answer?.message ?? (res.status === 403 ? 'Only an administrator can change this.' : `Couldn’t save (${res.status}).`);
				return false;
			}
			assistant = { ...answer.assistant };
			provider = assistant.provider;
			choice = choiceOf(assistant);
			custom = choice === OTHER ? assistant.model : '';
			status = 'saved';
			message = '';
			return true;
		} catch (err) {
			status = 'error';
			message = err instanceof Error ? err.message : 'The change could not be sent.';
			return false;
		}
	}

	async function connect() {
		status = 'saving';
		if (await send('PUT', '/api/settings/assistant', { provider, model, apiKey: apiKey.trim() })) apiKey = '';
	}
	async function toggle() {
		status = 'saving';
		await send('PUT', '/api/settings/assistant', { enabled: !assistant.enabled });
	}
	async function test() {
		status = 'testing';
		await send('POST', '/api/settings/assistant/test');
	}
	async function removeKey() {
		status = 'saving';
		await send('DELETE', '/api/settings/assistant');
	}

	const inputClass = 'mt-1 w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300';
	const buttonClass = 'rounded-field border border-line px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-sunken disabled:opacity-50';
</script>

<p class="text-xs text-ink-500">
	An AI that Lyriks calls itself, from the server, to draw the diagrams of a request's Functional and Technical spec from their texts when
	someone asks for it. Off, Lyriks calls no AI service at all. One connection serves everybody on the installation: an administrator sets
	it, and its key is stored encrypted and never shown again.
</p>

{#if !isAdmin}
	<div class="rounded-field border border-line bg-surface px-3.5 py-3 text-sm text-ink-800">
		{#if assistant.enabled && connected}
			On, with {providerOf(assistant.provider).label}, {shownOffered ? shownOffered.label : 'model'} <code class="text-xs">{shownModel}</code>.
		{:else}
			Off: the AI at work is each person's own, through the Lyriks MCP.
		{/if}
		<p class="mt-1 text-xs text-ink-500">Only an administrator changes this.</p>
	</div>
{:else}
	<ToggleTile
		title={assistant.enabled ? 'Built-in assistant on' : 'Built-in assistant off'}
		hint={assistant.enabled
			? `People who may write on a request can have it draw a diagram, through ${providerOf(assistant.provider).label}.`
			: connected
				? 'Connected but off: nothing is sent to the provider.'
				: 'Connect it below first: the provider, the model and an API key.'}
		selected={assistant.enabled}
		onToggle={toggle}
	/>

	<div class="space-y-3 border-t border-line pt-4">
		<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">Connection, for everybody</p>
		<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Provider">
			{#each ASSISTANT_PROVIDERS as p (p.code)}
				<button
					type="button"
					role="radio"
					aria-checked={provider === p.code}
					onclick={() => pickProvider(p.code)}
					class="rounded-pill border px-2.5 py-1 text-xs font-medium transition {provider === p.code
						? 'border-brand-400 bg-brand-500/10 text-brand-600'
						: 'border-line text-ink-500 hover:text-ink-700'}"
				>
					{p.label}
				</button>
			{/each}
		</div>
		<div class="space-y-1.5">
			<p class="text-xs text-ink-500" id="assistant-model-label">Model</p>
			<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="assistant-model-label">
				{#each offered as m (m.id)}
					<button
						type="button"
						role="radio"
						aria-checked={choice === m.id}
						onclick={() => (choice = m.id)}
						class="rounded-pill border px-2.5 py-1 text-xs font-medium transition {choice === m.id
							? 'border-brand-400 bg-brand-500/10 text-brand-600'
							: 'border-line text-ink-500 hover:text-ink-700'}"
					>
						{m.label}
					</button>
				{/each}
				<button
					type="button"
					role="radio"
					aria-checked={choice === OTHER}
					onclick={() => (choice = OTHER)}
					class="rounded-pill border px-2.5 py-1 text-xs font-medium transition {choice === OTHER
						? 'border-brand-400 bg-brand-500/10 text-brand-600'
						: 'border-line text-ink-500 hover:text-ink-700'}"
				>
					Other model
				</button>
			</div>
			{#if choice === OTHER}
				<input id="assistant-model" bind:value={custom} placeholder={provider === 'anthropic' ? 'claude-sonnet-5' : 'The model id, as in the OpenAI platform'} autocomplete="off" aria-label="Model name" class={inputClass} />
				<p class="text-[0.6875rem] text-ink-400">The model's name, written as the provider writes it. Test the connection to check it exists.</p>
			{:else if picked}
				<p class="text-[0.6875rem] text-ink-400"><code>{picked.id}</code>: {picked.hint}</p>
			{/if}
		</div>
		<div>
			<label class="block text-xs text-ink-500" for="assistant-key">API key</label>
			<input
				id="assistant-key"
				type="password"
				bind:value={apiKey}
				autocomplete="off"
				placeholder={connected ? `Stored, ending ${assistant.keyHint}: leave empty to keep it` : 'Paste the API key'}
				class={inputClass}
			/>
			<p class="mt-1 text-[0.6875rem] text-ink-400">
				{#if provider === 'anthropic'}
					Made in the Claude Console. With a Max or Team subscription, a key from a Console organisation linked to it draws on the API credits the
					subscription includes.
				{:else}
					Made in the OpenAI platform, under the project that pays for it.
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={connect}
				disabled={status === 'saving' || !changed || model === ''}
				class="rounded-field bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
			>
				{status === 'saving' ? 'Saving…' : 'Save the connection'}
			</button>
			<button type="button" onclick={test} disabled={!connected || status === 'testing' || changed} class={buttonClass}>
				{status === 'testing' ? 'Testing…' : 'Test the connection'}
			</button>
			{#if connected}
				<button type="button" onclick={removeKey} disabled={status === 'saving'} class={buttonClass}>Remove the key</button>
			{/if}
		</div>
		{#if connected}
			<p class="text-xs {assistant.test === 'works' ? 'text-success-600' : assistant.test === 'failed' ? 'text-danger-500' : 'text-ink-500'}">
				{#if assistant.test === 'works'}
					The connection works{assistant.testedAt ? `, tested ${new Date(assistant.testedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.
				{:else if assistant.test === 'failed'}
					The last test failed: {assistant.testDetail}
				{:else}
					Not tested yet: test it before switching the assistant on.
				{/if}
			</p>
		{/if}
		<p class="text-[0.6875rem] text-ink-400">
			The server calls {providerOf(provider).host} only while the assistant is on, and only when someone asks it to draw. Each call is recorded in
			the audit log with who asked; never the key, never the texts.
		</p>
	</div>
{/if}

{#if status === 'saved'}
	<span class="text-xs font-medium text-success-600">Saved.</span>
{:else if status === 'error'}
	<span class="text-xs font-medium text-danger-500">{message}</span>
{/if}
