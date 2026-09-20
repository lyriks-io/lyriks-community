<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Icon } from '$ui/design-system';
	import {
		blocksFor,
		canAnswerInGuidedFill,
		canStepBack,
		pendingFields,
		type EvolutionRequest,
		type PendingField
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Fill the gaps: one question per screen, driven by the keyboard, over the
	 * fields still empty or marked as open questions. A second reading of the
	 * same page, not a wizard: it opens on what is pending, saves an answer the
	 * way a field on the page is saved, and Escape returns to the document on
	 * the field that was open.
	 *
	 * The walk is fixed when the mode opens. Answering a field does not reshuffle
	 * the questions under the author's hands; what was answered simply stops
	 * being pending the next time the mode opens.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		canEdit: boolean;
		/** What the section behind a capability field holds today, by canonical path. */
		held: Record<string, { summary: string; names: string[] }>;
		/** Close the mode. The document scrolls to the field that was open. */
		onLeave: (fieldPath: string) => void;
		onOpenCanonical: (section: string, path: string) => void;
	}
	let { store, request, canEdit, held, onLeave, onOpenCanonical }: Props = $props();

	// Read once, on purpose: the walk is fixed when the mode opens.
	const walk: readonly PendingField[] = untrack(() =>
		pendingFields(
			store.filledKeysOf(request),
			request.openQuestionKeys,
			request.leafIds,
			blocksFor(request)
		)
	);
	let step = $state(0);
	let draft = $state('');
	let saving = $state(false);
	let refusal = $state('');
	let answered = $state(0);

	const current = $derived<PendingField | null>(step < walk.length ? walk[step] : null);
	const finished = $derived(current === null);
	const progress = $derived(Math.round((Math.min(step, walk.length) / Math.max(1, walk.length)) * 100));
	const leafName = (id: string | null) => id ?? '';

	// Each step starts from what the owning section holds, and puts the cursor
	// where the author will type.
	$effect(() => {
		const c = current;
		draft = c && c.field.editor === 'inline' ? (store.fieldValues[c.key]?.value ?? '') : '';
		refusal = '';
		requestAnimationFrame(() => {
			const el = document.querySelector<HTMLElement>('[data-guided-input]');
			el?.focus();
			if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
		});
	});

	/** Save the answer the way a field on the page is saved, then move on. */
	async function answerAndAdvance() {
		const allowed = canAnswerInGuidedFill(true);
		if (!allowed.ok || !current || saving) return;
		if (current.field.editor === 'inline') {
			if (draft.trim() === '') {
				refusal = 'Type an answer, or move past this question with the arrow.';
				return;
			}
			saving = true;
			const failure = await store.saveField(
				request,
				current.field.path,
				current.leafId ?? '',
				draft,
				store.fieldValues[current.key]?.sourceIds ?? []
			);
			saving = false;
			if (failure) {
				refusal = failure.reason;
				return;
			}
		} else {
			// A reading is not answered here: it fills once something is written
			// where it lives. The walk simply moves on.
			step += 1;
			return;
		}
		answered += 1;
		step += 1;
	}

	/** Cannot answer yet: say so in amber and keep going. */
	function markOpenAndAdvance() {
		if (!current) return;
		if (!current.openQuestion)
			store.markOpenQuestion(request.id, current.field.path, current.leafId, 'in_progress', canEdit);
		step += 1;
	}

	function next() {
		if (finished) leave();
		else step += 1;
	}

	function back() {
		const allowed = canStepBack({ active: true, stepIndex: step });
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		step -= 1;
	}

	function leave() {
		onLeave(current?.field.path ?? walk[walk.length - 1]?.field.path ?? '');
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			leave();
			return;
		}
		const inField = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void answerAndAdvance();
			return;
		}
		if (e.key === 'Enter' && !inField) {
			e.preventDefault();
			if (finished) leave();
			else void answerAndAdvance();
			return;
		}
		if (e.key === 'ArrowUp' && (!inField || e.altKey)) {
			e.preventDefault();
			back();
			return;
		}
		if (e.key === 'ArrowDown' && (!inField || e.altKey)) {
			e.preventDefault();
			next();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 flex flex-col bg-canvas"
	role="dialog"
	aria-modal="true"
	aria-label="Fill the gaps"
>
	<div class="h-1 bg-line">
		<div class="h-full bg-brand-500 transition-all" style="width: {progress}%"></div>
	</div>

	<div class="flex items-center justify-between gap-3 px-6 py-4">
		<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
			<span class="text-brand-600">{current ? current.block.title : 'End of the walk'}</span>
			<span class="text-ink-300">·</span>
			<span class="text-ink-400">
				{finished ? `${answered} answered` : `${step + 1} / ${walk.length}`}
			</span>
		</div>
		<Button variant="outline" size="sm" onclick={leave}>
			<Icon name="arrow-left" size={13} /> Document · Esc
		</Button>
	</div>

	<div class="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
		<div class="w-full max-w-2xl space-y-4">
			{#if current}
				<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
					Question {step + 1}
					{#if current.leafId}
						<span class="ml-2 rounded-pill bg-surface-sunken px-2 py-0.5 normal-case tracking-normal text-ink-600">
							{leafName(current.leafId)}
						</span>
					{/if}
					{#if current.openQuestion}
						<span
							class="ml-2 inline-flex items-center gap-1 rounded-pill bg-warning-100 px-2 py-0.5 normal-case tracking-normal text-warning-700"
						>
							<Icon name="circle-question-mark" size={10} /> open question
						</span>
					{/if}
				</p>
				<h2 class="text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">
					{current.field.question}
				</h2>
				<p class="max-w-prose text-sm text-ink-500">{current.field.whyItMatters}</p>

				{#if current.field.editor === 'inline'}
					<textarea
						data-guided-input
						bind:value={draft}
						disabled={!canEdit || saving}
						rows={current.field.kind === 'list' ? 6 : 5}
						placeholder={current.field.example}
						class="w-full resize-y rounded-card border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-400 disabled:opacity-60"
					></textarea>
				{:else}
					<!-- A reading: what is written where it lives, and what the impact
					     report moves. The completion or an author writes there; the walk
					     points at it and moves on. -->
					{@const r = store.readingOf(request, current.field.path, current.leafId)}
					<div class="space-y-2 rounded-card border border-line bg-surface p-4">
						<p class="text-sm text-ink-700">
							Read from <span class="font-semibold">{current.field.section}</span>:
							{r ? r.summary : 'no reading yet'}.
							{#if r && r.names.length > 0}
								<span class="text-ink-500">({r.names.join(', ')})</span>
							{/if}
						</p>
						<p class="text-[11px] text-ink-500">
							Nothing to type here. The completion writes there through the MCP, or open it.
						</p>
						<button
							type="button"
							data-guided-input
							onclick={() => onOpenCanonical(current.field.section, current.field.canonicalPath)}
							class="inline-flex items-center gap-1 rounded-field border border-line bg-surface-sunken/60 px-2.5 py-1.5 font-mono text-[11px] text-ink-700 hover:border-brand-300 hover:text-brand-600"
						>
							{current.field.canonicalPath} <Icon name="arrow-up-right" size={11} />
						</button>
					</div>
				{/if}

				{#if refusal}
					<p class="flex items-start gap-1 text-sm text-danger-600">
						<Icon name="circle-alert" size={13} class="mt-0.5 shrink-0" />
						{refusal}
					</p>
				{/if}

				<div class="flex flex-wrap items-center gap-3 pt-2">
					<Button onclick={answerAndAdvance} disabled={!canEdit || saving}>
						{current.field.editor === 'inline' ? 'Save and next' : 'Next'}
					</Button>
					<button
						type="button"
						onclick={markOpenAndAdvance}
						disabled={!canEdit}
						class="rounded-pill border border-warning-300 px-3 py-1.5 text-xs font-semibold text-warning-700 hover:bg-warning-50 disabled:opacity-60"
						title="Cannot answer this yet? Say so: it turns amber and lowers nothing on the other fields."
					>
						{current.openQuestion ? 'Still open, next' : 'I cannot answer yet'}
					</button>
					<span class="text-[11px] text-ink-400">
						Ctrl + Enter saves and moves on · Alt + arrows move · Esc returns to the document
					</span>
					<div class="ml-auto flex gap-1">
						<button
							type="button"
							onclick={back}
							aria-label="Previous question"
							class="rounded-field border border-line bg-surface p-2 text-ink-500 hover:border-ink-400 hover:text-ink-800"
						>
							<Icon name="chevron-up" size={14} />
						</button>
						<button
							type="button"
							onclick={next}
							aria-label="Next question"
							class="rounded-field border border-line bg-surface p-2 text-ink-500 hover:border-ink-400 hover:text-ink-800"
						>
							<Icon name="chevron-down" size={14} />
						</button>
					</div>
				</div>
			{:else}
				<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">End of the walk</p>
				<h2 class="text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">
					{walk.length === 0 ? 'Nothing is left to ask.' : 'That was the last question.'}
				</h2>
				<p class="max-w-prose text-sm text-ink-500">
					{answered} {answered === 1 ? 'answer' : 'answers'} saved in this walk. Whatever you left
					open stays amber on the page, counted as the hole it is. The next stage is the gate under
					the document.
				</p>
				<div class="flex flex-wrap items-center gap-3 pt-2">
					<Button onclick={leave}>Back to the document</Button>
					<span class="text-[11px] text-ink-400">Enter or Esc</span>
				</div>
			{/if}
		</div>
	</div>
</div>
