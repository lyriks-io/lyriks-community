<script lang="ts">
	import { Button, Icon, Textarea } from '$ui/design-system';
	import DossierField from './DossierField.svelte';
	import {
		IMPACT_NODE_KINDS,
		canonicalPathsFor,
		fieldKey,
		isLeafScoped,
		type BlockField,
		type EvolutionRequest
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * One field of the dossier, read as a question. The question is the heading,
	 * why it matters sits under it, and below come what the impact report found
	 * here, what a model proposed for it, and the home the value is written to:
	 * one per feature the change touches, never a copy on the dossier.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		field: BlockField;
		/** The state of the block the field belongs to, for the open-question guard. */
		blockState: string;
		canEdit: boolean;
		sources: readonly { id: string; title: string; url: string; note: string }[];
		held: Record<string, { summary: string; names: string[] }>;
		filled: ReadonlySet<string>;
		focused: boolean;
		onOpenCanonical: (section: string, path: string) => void;
		onOpenThread: (leafId: string | null) => void;
	}
	let {
		store,
		request,
		field,
		blockState,
		canEdit,
		sources,
		held,
		filled,
		focused,
		onOpenCanonical,
		onOpenThread
	}: Props = $props();

	const homes = $derived(canonicalPathsFor(field, request.leafIds));
	const leafScoped = $derived(isLeafScoped(field));
	const isOpen = (leafId: string | null) => store.isOpenQuestion(request, field.path, leafId);
	const anyOpen = $derived(homes.some((h) => isOpen(h.leafId)));
	// A leaf-scoped field is filled only once it is filled for EVERY feature the
	// change touches: half a spec is not a spec.
	const isFilled = $derived(
		homes.length > 0 && !anyOpen && homes.every((h) => filled.has(fieldKey(field.path, h.leafId)))
	);
	const leafName = (id: string | null) => id ?? '';

	function toggleOpenQuestion(leafId: string | null) {
		if (isOpen(leafId)) store.answerOpenQuestion(request.id, field.path, leafId, canEdit);
		else store.markOpenQuestion(request.id, field.path, leafId, blockState, canEdit);
	}
	const threadSummary = (leafId: string | null) => {
		const t = store.threadOf(request, field.path, leafId);
		return t ? { state: t.state, messages: t.messages.length } : null;
	};

	const kindLabel = (code: string) =>
		IMPACT_NODE_KINDS.find((k) => k.code === code)?.label ?? code;

	let rewording = $state<string | null>(null);
	let rewordDraft = $state('');
	let refusing = $state<string | null>(null);
	let refuseComment = $state('');
</script>

<div
	id={`dossier-field-${field.path}`}
	class="scroll-mt-24 rounded-card border p-4 {focused
		? 'border-brand-300 bg-brand-50/20'
		: anyOpen
			? 'border-warning-300 bg-warning-50/20'
			: 'border-line bg-surface'}"
>
	<!-- The question is the heading. A filing label does not provoke writing; a question does. -->
	<div class="flex items-start gap-2">
		<h4 class="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink-900">
			{field.question}
		</h4>
		<span class="flex shrink-0 items-center gap-1.5 pt-0.5">
			{#if isFilled}
				<Icon name="check" size={14} class="text-success-600" />
			{:else if anyOpen}
				<Icon name="circle-question-mark" size={14} class="text-warning-600" />
			{/if}
			{#if field.critical && !isFilled}
				<span
					class="rounded-pill bg-danger-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-danger-700"
					title="Its emptiness alone bars the Ready tier"
				>
					blocks until filled
				</span>
			{/if}
		</span>
	</div>
	<p class="mt-1 text-[12px] text-ink-500">{field.whyItMatters}</p>

	{#if field.editor === 'capability'}
		<!-- A reading: what the touched features hold where this lives, and what
		     the impact report moves there. Nothing is ticked; an empty reading is
		     what the completion goes and writes. -->
		<div class="mt-2 space-y-1.5">
			{#if homes.length === 0}
				<p class="text-[11px] text-info-700">
					Name what this change touches, or let the impact report do it, to read this.
				</p>
			{:else}
				{#each homes as home (home.path)}
					{@const r = store.readingOf(request, field.path, home.leafId)}
					{@const homeThread = threadSummary(home.leafId)}
					<div
						class="flex flex-wrap items-start gap-2 rounded-field border px-2.5 py-2 {r?.filled
							? 'border-line bg-surface'
							: 'border-dashed border-line bg-surface-sunken/40'}"
					>
						<div class="min-w-0 flex-1">
							<p class="text-[12px] text-ink-800">
								{#if request.leafIds.length > 1 && home.leafId}
									<span class="font-semibold">{leafName(home.leafId)}:</span>
								{/if}
								{r ? r.summary : 'reading not available yet'}
							</p>
							{#if r && r.names.length > 0}
								<!-- Names, not counts: what the model says is what a reviewer reads. -->
								<ul class="mt-1 space-y-0.5">
									<!-- Keyed by position: two guards may refuse with the same sentence. -->
									{#each r.names as name, i (i)}
										<li class="text-[11px] leading-snug text-ink-600">{name}</li>
									{/each}
								</ul>
							{/if}
							{#if r && r.moving.length > 0}
								<!-- What this change moves here, each with what to do and why, whole. -->
								<ul class="mt-1.5 space-y-1.5 border-t border-line pt-1.5">
									{#each r.moving as node, i (i)}
										<li class="text-[11px] leading-snug text-ink-700">
											<span class="flex flex-wrap items-center gap-1.5">
												<span
													class="rounded-pill border border-line bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500"
												>
													{kindLabel(node.kind)}
												</span>
												<span class="font-medium text-ink-800">{node.label}</span>
												{#if node.work}
													<span class="text-ink-500">· {node.work}</span>
												{/if}
											</span>
											{#if node.note}
												<span class="mt-0.5 block text-ink-600">{node.note}</span>
											{:else}
												<span class="mt-0.5 block italic text-ink-400">
													The impact report gave no reason for this one.
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
							{#if r && !r.filled}
								<p class="mt-0.5 text-[10px] text-ink-400">
									A reading, nothing to fill: it completes when the impact report runs, or when the
									completion writes in {field.section} through the MCP.
								</p>
							{/if}
						</div>
						<span class="flex shrink-0 items-center gap-0.5">
							<button
								type="button"
								onclick={() => onOpenThread(home.leafId)}
								aria-label="Discuss this reading"
								title="Discuss this reading where it stands"
								class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] {homeThread?.state ===
								'open'
									? 'text-warning-700'
									: 'text-ink-300 hover:text-brand-600'} hover:bg-surface-sunken"
							>
								<Icon name="message-circle" size={12} />
								{#if homeThread && homeThread.messages > 0}{homeThread.messages}{/if}
							</button>
							<button
								type="button"
								onclick={() => onOpenCanonical(field.section, home.path)}
								aria-label="Open it where it lives"
								title="Open it where it lives: {home.path}"
								class="rounded p-1 text-ink-300 hover:bg-surface-sunken hover:text-brand-600"
							>
								<Icon name="arrow-up-right" size={12} />
							</button>
						</span>
					</div>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- What a model offered for this field. Nothing of it reaches the spec until a person signs it. -->
	{#each store.proposalsFor(request, field.path) as proposal (proposal.id)}
		<section class="mt-2 rounded-field border border-brand-200 bg-brand-50/40 p-2.5">
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="rounded-pill bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-700"
				>
					Proposed
				</span>
				<span class="text-[10px] text-ink-500">
					Written for you. Nothing is in the specification until you accept it.
				</span>
				{#if proposal.bannedSynonymDetected}
					<span
						class="rounded-pill bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold text-warning-700"
						title="The glossary bans a word this value uses; reword it first"
					>
						banned wording
					</span>
				{/if}
			</div>
			{#if rewording === proposal.id}
				<Textarea value={rewordDraft} oninput={(v) => (rewordDraft = v)} rows={4} class="mt-2" />
				<div class="mt-1.5 flex items-center gap-2">
					<Button
						size="sm"
						onclick={() => {
							store.rewordProposal(request, proposal.id, rewordDraft);
							rewording = null;
						}}
					>
						Keep this wording
					</Button>
					<button
						type="button"
						class="text-xs text-ink-500 hover:text-ink-800"
						onclick={() => (rewording = null)}
					>
						Cancel
					</button>
				</div>
			{:else}
				<p class="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-800">
					{proposal.value}
				</p>
			{/if}
			{#if proposal.reasoning}
				<p class="mt-1.5 text-[11px] leading-snug text-ink-600">
					<span class="font-medium text-ink-700">Why:</span>
					{proposal.reasoning}
				</p>
			{/if}
			<p class="mt-1 text-[10px] text-ink-500">
				{proposal.citedSourceIds.length === 0
					? 'Cites nothing, so it cannot be accepted: a value nobody can trace back cannot be signed for.'
					: `Rests on ${proposal.citedSourceIds
							.map((id) => sources.find((s) => s.id === id)?.title ?? id)
							.join(', ')}.`}
				{proposal.reasoningSeparatesReadFromInferred
					? ''
					: ' The reasoning does not separate what was read from what was inferred, so it cannot be accepted as it stands.'}
			</p>
			{#if refusing === proposal.id}
				<Textarea
					value={refuseComment}
					oninput={(v) => (refuseComment = v)}
					rows={2}
					placeholder="Why this value is wrong, so the next attempt is better"
					class="mt-2"
				/>
				<div class="mt-1.5 flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						onclick={() => {
							store.refuseProposal(request, proposal.id, refuseComment);
							refusing = null;
							refuseComment = '';
						}}
					>
						Refuse it
					</Button>
					<button
						type="button"
						class="text-xs text-ink-500 hover:text-ink-800"
						onclick={() => (refusing = null)}
					>
						Cancel
					</button>
				</div>
			{:else if canEdit}
				<div class="mt-2 flex flex-wrap items-center gap-1.5">
					<Button size="sm" onclick={() => store.acceptProposal(request, proposal.id)}>Accept</Button>
					<button
						type="button"
						onclick={() => {
							rewording = proposal.id;
							rewordDraft = proposal.value;
						}}
						class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600"
					>
						Reword
					</button>
					<button
						type="button"
						onclick={() => (refusing = proposal.id)}
						class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-danger-300 hover:text-danger-700"
					>
						Refuse
					</button>
				</div>
			{/if}
		</section>
	{/each}

	<!-- Where the value lives: one home per feature the change touches, never a copy here. -->
	<div class="mt-2 space-y-1.5">
		{#if field.editor === 'capability'}
			<!-- Read above. -->
		{:else if homes.length === 0}
			<span
				class="inline-block rounded-field border border-info-200 bg-info-50 px-2 py-1 text-[10px] text-info-700"
				title="A field that cannot say where it belongs is refused rather than stored on the dossier"
			>
				No home yet: name what this touches, or let the impact report do it.
			</span>
		{:else if field.editor === 'inline'}
			{#each homes as home (home.path)}
				{@const value = store.fieldValues[fieldKey(field.path, home.leafId)]}
				<DossierField
					{field}
					leafId={home.leafId ?? ''}
					leafName={leafName(home.leafId)}
					showLeafName={request.leafIds.length > 1}
					canonicalPath={home.path}
					value={value?.value ?? ''}
					sourceIds={value?.sourceIds ?? []}
					{sources}
					{canEdit}
					openQuestion={isOpen(home.leafId)}
					onToggleOpenQuestion={() => toggleOpenQuestion(home.leafId)}
					signatures={store.signaturesOf(request, field.path, home.leafId)}
					signedByMe={store.signedByMe(request, field.path, home.leafId)}
					canSign={store.canSignField(request, field.path, home.leafId)}
					onSign={() => store.signField(request, field.path, home.leafId)}
					onWithdraw={() => store.withdrawSignature(request, field.path, home.leafId)}
					thread={threadSummary(home.leafId)}
					onOpenThread={() => onOpenThread(home.leafId)}
					onSave={(v, ids) => store.saveField(request, field.path, home.leafId ?? '', v, ids)}
					onOpenCanonical={() => onOpenCanonical(field.section, home.path)}
					onOpenRegister={() => onOpenCanonical('documents', 'documents.sources')}
				/>
			{/each}
		{/if}
	</div>
</div>
