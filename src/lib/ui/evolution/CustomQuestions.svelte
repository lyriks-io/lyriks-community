<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Icon, Textarea, promptDialog } from '$ui/design-system';
	import type { DossierReading } from '$lib/server/evolution-view.server';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey } from './dossier-overlay';
	import type { PageChanges } from './page-edit';
	import { personName } from './people';
	import { TONE } from './verdict-tones';

	/**
	 * The questions asked of this request in particular, on one step
	 * (ac-evo-coach-custom-1..4): owed in amber until a person answers them or
	 * sets them aside with a reason; the settled ones fold to one line. An answer
	 * is a fact: the assistant turns it into a proposal to accept. An answer, or
	 * a question set aside, settles it at once (ac-evo-form-edit-optimistic); one
	 * the server refuses comes back with what was written.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		step: string;
		questions: DossierReading['customQuestions'];
		members: readonly { id: string; name: string }[];
		canEdit: boolean;
		pageEditing?: boolean;
		/** Who answers, named on the question settled. */
		actorId?: string;
	}
	let { projectId, requestId, step, questions, members, canEdit, pageEditing = false, actorId = '' }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));

	const mine = $derived(questions.entries.filter((q) => q.step === step));
	const open = $derived(mine.filter((q) => q.status === 'open'));
	const settled = $derived(mine.filter((q) => q.status !== 'open'));
	let settledOpen = $state(false);
	let answers = $state<Record<string, string>>({});
	let aside = $state<Record<string, string>>({});
	let wasPageEditing = $state(false);
	$effect(() => {
		const active = pageEditing;
		untrack(() => {
			if (wasPageEditing && !active) { answers = {}; aside = {}; }
			wasPageEditing = active;
		});
	});
	const nameOf = (id: string | null) => (id ? personName(id, members) : '');
	export function pageChanges(): PageChanges {
		const changes = pageEditing && canEdit ? open.flatMap((question) => {
			const text = aside[question.id] ?? answers[question.id]?.trim();
			if (!text) return [];
			const resolution = aside[question.id] ? 'set_aside' : 'answered';
			return [{ questionId: question.id, resolution, text }];
		}) : [];
		return {
			operations: changes.map((change) => ({ requestId, op: 'resolve_question', ...change })),
			patches: Object.fromEntries(changes.map((change) => [patchKey.question(change.questionId), { kind: 'question' as const, resolution: change.resolution as 'answered' | 'set_aside', text: change.text, by: actorId, at: new Date().toISOString() }]))
		};
	}

	async function resolve(questionId: string, resolution: 'answered' | 'set_aside', text: string) {
		const typed = answers[questionId] ?? '';
		answers = { ...answers, [questionId]: '' };
		const settled = { kind: 'question', resolution, text, by: actorId, at: new Date().toISOString() } as const;
		const what = resolution === 'answered' ? 'your answer to the question' : 'setting the question aside';
		if (!(await writes.send({ [patchKey.question(questionId)]: settled }, [{ requestId, op: 'resolve_question', questionId, resolution, text }], what)))
			answers = { ...answers, [questionId]: typed };
	}
	async function setAside(questionId: string) {
		const reason = await promptDialog({ title: 'Why does this question not apply?', placeholder: 'One sentence', confirmLabel: 'Set it aside' });
		if (pageEditing) {
			if (reason?.trim()) aside = { ...aside, [questionId]: reason.trim() };
			return;
		}
		if (reason !== null && reason.trim() !== '') await resolve(questionId, 'set_aside', reason);
	}
</script>

{#if mine.length > 0}
	<div class="space-y-2" aria-label="Questions asked of this request">
		{#each open as question (question.id)}
			<div class="space-y-1.5 rounded-field border border-l-4 p-3 text-xs {TONE.decide.box}">
				<p class="flex items-start gap-1.5 text-ink-900">
					<Icon name={TONE.decide.icon} size={13} class="mt-0.5 shrink-0 {TONE.decide.text}" />
					<span>
						<span class="font-bold">{question.question}</span>
						<span class="block text-ink-500">{question.why} · asked by {question.askedByKind === 'ai_client' ? 'the assistant' : nameOf(question.askedBy)}</span>
					</span>
				</p>
				{#if canEdit}
					<div class="flex items-start gap-2">
						<Textarea value={answers[question.id] ?? ''} rows={1} placeholder="Your answer, in your own words" oninput={(v) => { answers = { ...answers, [question.id]: v }; aside = Object.fromEntries(Object.entries(aside).filter(([id]) => id !== question.id)); }} class="flex-1" />
						{#if !pageEditing}<Button size="sm" disabled={(answers[question.id] ?? '').trim() === ''} onclick={() => resolve(question.id, 'answered', answers[question.id] ?? '')}>Answer</Button>{/if}
						<Button size="sm" variant="ghost" onclick={() => setAside(question.id)}>Does not apply</Button>
					</div>
					{#if pageEditing}<p class="text-ink-500">{aside[question.id] ? `Set aside on Save: ${aside[question.id]}` : 'This answer is saved with the page.'}</p>{/if}
				{/if}
			</div>
		{/each}
		{#if settled.length > 0}
			<button type="button" class="flex items-center gap-1 px-1 text-xs text-ink-500 hover:text-ink-700" aria-expanded={settledOpen} onclick={() => (settledOpen = !settledOpen)}>
				<Icon name={settledOpen ? 'chevron-up' : 'chevron-down'} size={12} />
				<span class="size-2 {TONE.ok.dot}"></span>
				{settled.length} {settled.length === 1 ? 'question asked of this request is settled' : 'questions asked of this request are settled'}
			</button>
			{#if settledOpen}
				<ul class="space-y-1 px-1 text-xs text-ink-700">
					{#each settled as question (question.id)}
						<li>
							<span class="font-medium">{question.question}</span>
							<span class="text-ink-500">· {question.status === 'answered' ? 'answered' : 'set aside'} by {nameOf(question.resolvedBy)}: {question.resolution}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/if}
