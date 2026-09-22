<script lang="ts">
	import { Button, Chip, Icon, MultiSelect, TextInput, Textarea, promptDialog } from '$ui/design-system';
	import type { BlockField } from '$domain/evolution';
	import type { DossierFieldRow, ProposalRow } from '$lib/server/evolution-view.server';
	import CitedSources from '$ui/documents/CitedSources.svelte';
	import { applyEvolution, saveFieldValue } from './reading-api';

	/**
	 * One question of the idea, for one touched feature: what the spec holds
	 * today, what the assistant proposes, and the person's decision. Accepting
	 * writes the value into the feature; typing writes it directly; either way
	 * the dossier keeps no copy.
	 */
	type FieldView = DossierFieldRow;
	type ProposalView = ProposalRow;

	interface Props {
		projectId: string;
		requestId: string;
		field: FieldView;
		meta: BlockField;
		proposal: ProposalView | null;
		canEdit: boolean;
		/** The roster a proposal can be handed to; empty where one member is alone. */
		members: readonly { id: string; name: string }[];
		/** Who is reading, so the card knows whether their verdict is awaited. */
		actorId: string;
	}
	let { projectId, requestId, field, meta, proposal, canEdit, members, actorId }: Props = $props();

	const memberOptions = $derived(members.map((m) => ({ code: m.id, label: m.name })));
	const reviewed = $derived((proposal?.reviewerIds.length ?? 0) > 0);
	const awaitsMe = $derived(!!proposal && proposal.reviewerIds.includes(actorId) && !proposal.reviewers.some((r) => r.id === actorId && r.verdict !== null));
	const mayDecide = $derived(!reviewed || awaitsMe);

	let editing = $state(false);
	let draft = $state('');
	let reply = $state('');
	let reasoningOpen = $state(false);
	let busy = $state(false);

	const leafId = $derived(field.leafId ?? '');
	const key = $derived({ requestId, fieldPath: field.path, leafId: field.leafId ?? undefined });

	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			return await applyEvolution(projectId, [{ ...key, ...op }]);
		} finally {
			busy = false;
		}
	}

	function startEditing() {
		draft = field.value;
		editing = true;
	}

	async function commit() {
		editing = false;
		if (draft === field.value) return;
		busy = true;
		try {
			await saveFieldValue(projectId, field.path, leafId, draft);
		} finally {
			busy = false;
		}
	}

	async function reword() {
		if (!proposal) return;
		const value = await promptDialog({
			title: `Reword the proposed ${meta.label.toLowerCase()}`,
			initial: proposal.value,
			confirmLabel: 'Reword'
		});
		if (value === null) return;
		await run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'reword', value });
	}

	async function refuse() {
		if (!proposal) return;
		const comment = await promptDialog({
			title: `${reviewed ? 'Invalidate' : 'Refuse'} the proposed ${meta.label.toLowerCase()}`,
			placeholder: 'Why it does not fit (optional)',
			confirmLabel: reviewed ? 'Invalidate' : 'Refuse'
		});
		if (comment === null) return;
		await run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'refuse', comment });
	}

	async function post() {
		const body = reply.trim();
		if (body === '') return;
		if (await run({ op: 'post_on_field', body })) reply = '';
	}
</script>

<article class="rounded-card border border-line bg-surface p-4" aria-label={meta.label}>
	<header class="flex flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<h4 class="text-sm font-semibold text-ink-900">
				{meta.label}
				{#if meta.critical}<span class="ml-1 text-[10px] font-medium uppercase tracking-wide text-ink-400">required</span>{/if}
			</h4>
			<p class="text-xs text-ink-400">{meta.question}</p>
		</div>
		<div class="flex items-center gap-1.5">
			{#if field.openQuestion}
				<Chip tone="accent">Open question</Chip>
			{:else if field.filled}
				<Icon name="check" size={14} class="text-success-600" />
			{/if}
		</div>
	</header>

	<!-- What the feature holds today -->
	<div class="mt-3">
		{#if editing}
			<Textarea value={draft} rows={meta.kind === 'list' ? 4 : 3} placeholder={meta.example} oninput={(v) => (draft = v)} />
			<div class="mt-2 flex gap-2">
				<Button size="sm" onclick={commit} disabled={busy}>Save</Button>
				<Button size="sm" variant="ghost" onclick={() => (editing = false)}>Cancel</Button>
			</div>
		{:else if field.filled}
			<p class="whitespace-pre-line text-sm leading-relaxed text-ink-900">{field.value}</p>
			{#if canEdit}
				<button type="button" class="mt-1 text-xs text-brand-600 hover:underline" onclick={startEditing}>Edit</button>
			{/if}
		{:else if !proposal}
			<p class="text-sm italic text-ink-400">Nothing written yet.</p>
			{#if canEdit}
				<button type="button" class="mt-1 text-xs text-brand-600 hover:underline" onclick={startEditing}>Write it</button>
				<span class="text-xs text-ink-400"> or ask the assistant to propose it.</span>
			{/if}
		{/if}
	</div>

	<!-- What the assistant proposes -->
	{#if proposal}
		<div class="mt-3 rounded-field border border-brand-100 bg-brand-50/60 p-3">
			<p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
				<Icon name="target" size={12} />
				Proposed by the assistant
				{#if proposal.decision === 'reworded'}<span class="font-normal normal-case text-ink-400">(reworded)</span>{/if}
			</p>
			<p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-900">{proposal.value}</p>
			<button type="button" class="mt-1.5 flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700" onclick={() => (reasoningOpen = !reasoningOpen)}>
				<Icon name={reasoningOpen ? 'chevron-up' : 'chevron-down'} size={12} />
				Why this value
			</button>
			{#if reasoningOpen}
				<p class="mt-1 text-xs text-ink-700">{proposal.reasoning}</p>
				<div class="mt-1">
					<CitedSources ids={proposal.citedSourceIds} />
				</div>
			{/if}
			{#if proposal.bannedSynonymDetected}
				<p class="mt-2 flex items-center gap-1 text-xs text-warning-700">
					<Icon name="circle-alert" size={12} />
					Uses a word the glossary bans: reword it before accepting.
				</p>
			{:else if !proposal.acceptable.ok}
				<p class="mt-2 flex items-center gap-1 text-xs text-warning-700">
					<Icon name="circle-alert" size={12} />
					{proposal.acceptable.reason}
				</p>
			{/if}
			<!-- Who decides: one person, or the tagged reviewers, every one of them. -->
			{#if members.length > 1 || reviewed}
				<div class="mt-3 border-t border-brand-100 pt-2">
					{#if canEdit && members.length > 1}
						<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Reviewers</p>
						<MultiSelect
							values={[...proposal.reviewerIds]}
							options={memberOptions}
							placeholder="Tag the members who validate this"
							onchange={(reviewerIds) => run({ op: 'tag_reviewers', proposalId: proposal.id, reviewerIds })}
						/>
					{/if}
					{#if reviewed}
						<ul class="mt-2 flex flex-wrap gap-1.5">
							{#each proposal.reviewers as reviewer (reviewer.id)}
								<li>
									<Chip tone={reviewer.verdict === 'validated' ? 'success' : reviewer.verdict === 'invalidated' ? 'warning' : 'neutral'}>
										{reviewer.name}{reviewer.verdict ? `: ${reviewer.verdict}` : ''}
									</Chip>
								</li>
							{/each}
						</ul>
						<p class="mt-1 text-[11px] text-ink-400">
							Written once every reviewer has validated; one invalidation refuses it.
							{#if !mayDecide}Your verdict is not awaited on this one.{/if}
						</p>
					{/if}
				</div>
			{/if}
			{#if canEdit}
				<div class="mt-3 flex flex-wrap gap-2">
					<Button size="sm" disabled={busy || !proposal.acceptable.ok || !mayDecide} onclick={() => run({ op: 'decide_proposal', proposalId: proposal.id, decision: 'accept' })}>
						<Icon name="check" size={12} />
						{reviewed ? 'Validate' : 'Accept'}
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onclick={reword}>Reword</Button>
					<Button size="sm" variant="ghost" disabled={busy || !mayDecide} onclick={refuse}>{reviewed ? 'Invalidate' : 'Refuse'}</Button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- The conversation next to the field -->
	{#if field.thread || canEdit}
		<div class="mt-3 border-t border-line pt-2">
			{#if field.thread}
				<ul class="space-y-1">
					{#each field.thread.messages as message (message.id)}
						<li class="text-xs text-ink-700">
							<span class="font-medium text-ink-900">{message.authorKind === 'ai_client' ? 'Assistant' : message.author}</span>
							<span class="text-ink-400"> · </span>
							{message.body}
						</li>
					{/each}
				</ul>
			{/if}
			{#if canEdit}
				<div class="mt-2 flex items-center gap-2">
					<TextInput value={reply} placeholder="Reply or ask a question here" oninput={(v) => (reply = v)} class="flex-1" />
					<Button size="sm" variant="outline" disabled={busy || reply.trim() === ''} onclick={post}>
						<Icon name="message-circle" size={12} />
						Post
					</Button>
					{#if field.openQuestion}
						<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'answer_open_question' })}>Not open any more</Button>
					{:else if !field.filled}
						<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'mark_open_question' })}>I cannot answer yet</Button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</article>
