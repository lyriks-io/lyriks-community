<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import { FIELD_THREAD_STATES, type BlockField, type EvolutionRequest } from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * The conversation about one field home, held next to the field: messages
	 * attributed to a person or an AI client, the state the thread is in, and
	 * the two ways a person ends it, answered or turned into a change. A thread
	 * is never deleted; one that became a change stays readable and takes no
	 * new message, so the next question opens a new thread on the new value.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		field: BlockField;
		leafId: string | null;
		leafName: string;
		canEdit: boolean;
		onClose: () => void;
	}
	let { store, request, field, leafId, leafName, canEdit, onClose }: Props = $props();

	const thread = $derived(store.threadOf(request, field.path, leafId));
	const stateLabel = $derived(
		FIELD_THREAD_STATES.find((s) => s.code === thread?.state)?.label ?? 'No thread yet'
	);
	const closedToMessages = $derived(thread?.state === 'turned_into_change');
	let draft = $state('');

	function submit() {
		const body = draft.trim();
		if (!body) return;
		if (store.postOnField(request, field.path, leafId, body)) draft = '';
	}
	function writeAsValue() {
		const value = draft.trim();
		if (!value) return;
		void store.turnThreadIntoChange(request, field.path, leafId, value).then((ok) => {
			if (ok) draft = '';
		});
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			submit();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<aside
	class="fixed inset-y-0 right-0 z-40 flex w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-xl"
	aria-label="Thread on {field.label}"
>
	<header class="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
		<div class="min-w-0">
			<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-600">
				{field.path.split('.')[0]}{leafName ? ` · ${leafName}` : ''}
			</p>
			<h3 class="truncate text-sm font-semibold text-ink-900">{field.question}</h3>
			<p class="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-400">
				<span
					class="rounded-pill px-1.5 py-0.5 font-semibold {thread?.state === 'open'
						? 'bg-warning-100 text-warning-700'
						: thread?.state === 'answered'
							? 'bg-success-50 text-success-700'
							: thread
								? 'bg-brand-50 text-brand-700'
								: 'bg-surface-sunken text-ink-500'}"
				>
					{stateLabel}
				</span>
				{thread ? `${thread.messages.length} ${thread.messages.length === 1 ? 'message' : 'messages'}` : ''}
			</p>
		</div>
		<button
			type="button"
			onclick={onClose}
			aria-label="Close the thread"
			class="rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
		>
			<Icon name="x" size={14} />
		</button>
	</header>

	<div class="flex-1 space-y-2 overflow-y-auto px-4 py-3">
		{#if !thread || thread.messages.length === 0}
			<p class="text-sm text-ink-400">
				Nothing said on this field yet. Ask a question, challenge the value, or propose a wording.
			</p>
		{:else}
			{#each thread.messages as m (m.id)}
				<div class="rounded-field border border-line bg-surface-sunken/40 px-3 py-2">
					<p class="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
						<span
							class="rounded-pill px-1.5 py-0.5 font-semibold {m.authorKind === 'ai_client'
								? 'bg-accent-50 text-accent-700'
								: 'bg-info-50 text-info-600'}"
						>
							{m.authorKind === 'ai_client' ? 'AI client' : 'person'}
						</span>
						<span class="font-semibold text-ink-700">{m.author}</span>
						<span>{m.postedAt.slice(0, 16).replace('T', ' ')}</span>
					</p>
					<p class="mt-1 whitespace-pre-wrap text-sm text-ink-800">{m.body}</p>
				</div>
			{/each}
		{/if}
		{#if thread?.state === 'turned_into_change'}
			<div class="rounded-field border border-brand-200 bg-brand-50/40 px-3 py-2 text-[11px] text-ink-700">
				<span class="font-semibold text-brand-700">Turned into a change</span>
				by {thread.changedBy} on {(thread.changedAt ?? '').slice(0, 16).replace('T', ' ')}:
				<span class="whitespace-pre-wrap">{thread.changeValue}</span>
			</div>
		{/if}
	</div>

	<footer class="space-y-2 border-t border-line px-4 py-3">
		{#if closedToMessages}
			<p class="text-[11px] text-ink-500">
				This thread produced a change and takes no new message. Posting opens a new thread on the
				new value.
			</p>
		{/if}
		<textarea
			bind:value={draft}
			rows={3}
			placeholder="Ask, challenge, or propose a wording. Ctrl + Enter posts."
			class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-400"
		></textarea>
		<div class="flex flex-wrap items-center gap-2">
			<Button size="sm" onclick={submit} disabled={draft.trim() === ''}>Post</Button>
			{#if canEdit && field.editor === 'inline'}
				<button
					type="button"
					onclick={writeAsValue}
					disabled={draft.trim() === '' || closedToMessages}
					class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
					title="End the thread by writing this text as the field's new value, under your name"
				>
					Write this as the new value
				</button>
			{/if}
			{#if thread && thread.state === 'open'}
				<button
					type="button"
					onclick={() => store.answerThread(request, field.path, leafId)}
					class="ml-auto rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-success-300 hover:text-success-700"
					title="Say, as a person, that the question got its answer"
				>
					Mark as answered
				</button>
			{/if}
		</div>
	</footer>
</aside>
