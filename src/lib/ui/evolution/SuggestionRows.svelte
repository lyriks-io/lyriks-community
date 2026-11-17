<script lang="ts">
	import { untrack } from 'svelte';
	import { linesOf, NO_SESSION_SENTENCE, ORIGIN_ANSWER_KEYS, placeElementId } from '$domain/evolution';
	import { Icon, pushToast } from '$ui/design-system';
	import type { ProposalRow } from '$lib/server/evolution-view.server';
	import LiveClickProgress from './LiveClickProgress.svelte';
	import { useLiveSession } from './live-session.svelte';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { OptimisticActs } from './optimistic-acts.svelte';
	import { patchKey, type Patch, type Patches } from './dossier-overlay';
	import { LLM_BADGE, SUGGESTED } from './evo-look';

	/**
	 * What an AI proposes for an answer, read the design's way: in dashed
	 * violet under the answer, its LLM badge, Accept and Reject. A list reads as
	 * the lines it would add, and those it would take away struck through, each
	 * decided on its own (ac-evo-llm-line-decision); a prose answer is accepted
	 * or rejected whole.
	 *
	 * When the AI misses one fact, it asks it here, in the suggestion
	 * (ac-evo-live-card-ask): the question, a few answers a click gives and a box
	 * for one's own words. The answer goes to the reader's AI, which rewrites the
	 * suggestion in place; what was asked and answered stays under the value.
	 *
	 * Every decision reads at once (ac-evo-form-edit-optimistic): an accepted
	 * value or line shows in the answer and leaves the suggestion, a rejected one
	 * leaves it, an answer to the AI's question shows as given; a refusal puts
	 * them back, its reason said.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		proposal: ProposalRow;
		kind: 'text' | 'list';
		canDecide: boolean;
		/** The questions of the section the suggestion belongs to: an answer to its question sends them to the AI too. */
		section?: readonly string[];
		/** The answer as the page reads it now, which an accepted line is added to or taken from. */
		current?: string;
	}
	let { projectId, requestId, proposal, kind, canDecide, section = [], current = '' }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));

	const lines = $derived(kind === 'list' ? (proposal.delta ? proposal.delta.added : linesOf(proposal.value)) : [proposal.value]);
	const removed = $derived(kind === 'list' && proposal.delta ? proposal.delta.removed : []);
	/** The answer reads a value at once: who asked and where it comes from are the request's, the rest an answer's text. */
	const written = (value: string): Patches =>
		proposal.targetField === ORIGIN_ANSWER_KEYS.requester
			? { [patchKey.request]: { kind: 'request', requester: value } }
			: proposal.targetField === ORIGIN_ANSWER_KEYS.origin
				? { [patchKey.request]: { kind: 'request', origin: value } }
				: { [patchKey.text(proposal.targetField, proposal.leafId)]: { kind: 'text', value } };
	async function decide(decision: 'accept' | 'refuse') {
		const patches: Patches = { [patchKey.proposal(proposal.id)]: { kind: 'decided' }, ...(decision === 'accept' ? written(proposal.value) : {}) };
		if (await writes.send(patches, [{ requestId, op: 'decide_proposal', proposalId: proposal.id, decision }], decision === 'accept' ? 'accepting the suggestion' : 'rejecting the suggestion'))
			pushToast({ level: decision === 'accept' ? 'success' : 'info', message: decision === 'accept' ? 'Suggestion accepted' : 'Suggestion rejected' });
	}

	/** One line of a list, accepted (written into the answer) or rejected (out of the suggestion), the others still waiting. */
	async function decideLine(line: string, decision: 'accept' | 'refuse') {
		const held = linesOf(current);
		const next = removed.includes(line) ? held.filter((l) => l !== line) : [...held, line];
		const patches: Patches = {
			[patchKey.proposalLine(proposal.id, line)]: { kind: 'line-decided', proposalId: proposal.id, line } satisfies Patch,
			...(decision === 'accept' ? written(next.join('\n')) : {})
		};
		if (await writes.send(patches, [{ requestId, op: 'decide_proposal_line', proposalId: proposal.id, line, decision }], decision === 'accept' ? 'accepting the line' : 'rejecting the line'))
			pushToast({ level: decision === 'accept' ? 'success' : 'info', message: decision === 'accept' ? 'Line accepted' : 'Line rejected' });
	}
	const onAccept = (line: string) => (kind === 'list' ? decideLine(line, 'accept') : decide('accept'));
	const onReject = (line: string) => (kind === 'list' ? decideLine(line, 'refuse') : decide('refuse'));

	const live = useLiveSession();
	/** The answer just sent to the AI's question, read at once until the suggestion is read back. */
	const answering = new OptimisticActs<string>();
	const ask = $derived.by(() => {
		const sent = answering.of(proposal.id);
		return proposal.ask && sent ? { ...proposal.ask, answer: { body: sent, by: '', at: new Date().toISOString() } } : proposal.ask;
	});
	/** Where the answer stands once sent: the AI has it, or is rewriting the suggestion (ac-evo-live-click-state). */
	const rewrite = $derived(live?.clickOn({ fieldPath: proposal.targetField, leafId: proposal.leafId }, 'prefill') ?? null);
	/** Why an answer cannot reach the reader's AI now; null when it can (ac-evo-live-no-session). */
	const refusal = $derived(live ? live.refusal('prefill') : NO_SESSION_SENTENCE);
	let own = $state('');
	/** The answers ticked on a question that takes several (ac-evo-live-choices). */
	let ticked = $state<string[]>([]);
	const toggle = (choice: string) => (ticked = ticked.includes(choice) ? ticked.filter((c) => c !== choice) : [...ticked, choice]);

	async function answer(body: string) {
		const session = live;
		if (!session) return;
		const said = body.trim();
		if (said === '') return pushToast({ level: 'info', message: 'Write your answer, or click one of the answers offered' });
		const typed = own;
		own = '';
		ticked = [];
		const target = { fieldPath: proposal.targetField, leafId: proposal.leafId };
		if (!(await answering.run(proposal.id, said, () => session.answerSuggestion(proposal.id, said, target, section), () => proposal))) own = typed || said;
	}
	/** Enter sends, Shift+Enter starts a new line, as in a thread. */
	function sendOnEnter(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		e.preventDefault();
		void answer(own);
	}
	// The design's filter chip (.ly-chip) for an answer to pick: a line border on paper; picked, an ink fill.
	const CHOICE = 'min-h-8 border-[1.5px] px-3 text-xs font-semibold disabled:opacity-50';
	const CHOICE_OFF = 'border-line bg-paper text-ink hover:border-ink';
	const CHOICE_ON = 'border-ink bg-ink text-paper';
	// The design's small filled button (.ly-btn--s .ly-btn--fill), for Accept and Send.
	const FILLED = 'pressable border-[1.5px] border-ink bg-evo-violet font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40';
</script>

<!-- The suggestion is a place a link opens on (ac-evo-live-guide). -->
<div id={placeElementId({ kind: 'proposal', id: proposal.id })} class="flex scroll-mt-36 flex-col gap-2">
	{#snippet decision(line: string, acceptTitle?: string, rejectTitle?: string)}
		<button type="button" class="min-h-8 rounded-md px-2.5 text-xs {FILLED}" disabled={!proposal.acceptable.ok} title={proposal.acceptable.ok ? acceptTitle : proposal.acceptable.reason} onclick={() => void onAccept(line)}>Accept</button>
		<button type="button" class="quiet min-h-8 rounded-md px-2.5 text-evo-ink" title={rejectTitle} onclick={() => void onReject(line)}>Reject</button>
	{/snippet}
	{#each lines as line, at (at)}
		<div class="flex flex-wrap items-center gap-3 rounded-lg px-3.5 py-2.5 {SUGGESTED}">
			<span class="min-w-0 flex-[1_1_280px] whitespace-pre-line">{line}</span>
			<span class="flex flex-wrap items-center gap-1.5">
				<span class={LLM_BADGE}>LLM</span>
				{#if canDecide}{@render decision(line)}{/if}
			</span>
		</div>
	{/each}
	{#each removed as line (line)}
		<!-- A line the suggestion would take away: Accept takes it out of the answer, Reject keeps it. -->
		<div class="flex flex-wrap items-center gap-3 rounded-lg px-3.5 py-2.5 {SUGGESTED}">
			<span class="min-w-0 flex-[1_1_280px] whitespace-pre-line text-evo-muted line-through">{line}</span>
			<span class="flex flex-wrap items-center gap-1.5">
				<span class={LLM_BADGE}>LLM</span>
				{#if canDecide}{@render decision(line, 'Take this line out of the answer', 'Keep this line')}{/if}
			</span>
		</div>
	{/each}
	{#if proposal.dialogue.length > 0}
		<!-- Why it reads as it does: what the AI asked and the reader answered on the suggestions it replaced. -->
		<ul class="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-evo-muted" aria-label="What your AI asked">
			{#each proposal.dialogue as exchange, i (i)}
				<li><span class="text-evo-ink-3">{exchange.question}</span> · <b class="font-bold text-evo-ink">{exchange.answer}</b></li>
			{/each}
		</ul>
	{/if}
	{#if ask}
		<div class="animate-lk-in-fast flex flex-col gap-2 rounded-lg border-[1.5px] border-violet bg-paper px-3.5 py-2.5" role="group" aria-label="Your AI asks">
			<p class="m-0 text-[0.8125rem] leading-normal text-evo-ink">
				<span class="inline-flex items-center gap-1 font-bold text-violet-ink"><Icon name="sparkles" size={13} /> One thing is missing:</span>
				{ask.question}
			</p>
			{#if ask.answer}
				<p class="m-0 flex flex-wrap items-center gap-2 text-xs text-evo-ink-3" role="status">
					<span>You answered: <b class="font-bold text-evo-ink">{ask.answer.body}</b></span>
					{#if rewrite?.state === 'taken'}
						<LiveClickProgress click={rewrite} label="Your AI is rewriting the suggestion" />
					{:else if rewrite?.state === 'waiting'}
						<span class="font-evo-mono text-violet-ink">Waiting for your AI</span>
					{:else if rewrite?.state === 'cancelled'}
						<span class="font-evo-mono text-evo-ink-3">Cancelled · what Lyriks wrote for it is undone</span>
					{/if}
				</p>
			{:else if canDecide}
				{#if ask.choices.length > 0 && ask.multiple}
					<!-- A question that takes several: tick them, then send (ac-evo-live-choices). -->
					<span class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tick your answers">
						{#each ask.choices as choice (choice)}
							<label class="{CHOICE} inline-flex cursor-pointer items-center gap-1.5 {ticked.includes(choice) ? CHOICE_ON : CHOICE_OFF}">
								<input type="checkbox" class="accent-ink" checked={ticked.includes(choice)} onchange={() => toggle(choice)} />
								{choice}
							</label>
						{/each}
						<button type="button" class="inline-flex min-h-8 items-center gap-1 px-3 text-xs {FILLED}" disabled={ticked.length === 0} title={refusal ?? undefined} onclick={() => void answer(ticked.join(', '))}>
							<Icon name="sparkles" size={12} /> Send
						</button>
					</span>
				{:else if ask.choices.length > 0}
					<span class="flex flex-wrap gap-1.5">
						{#each ask.choices as choice (choice)}
							<button type="button" class="{CHOICE} {CHOICE_OFF}" title={refusal ?? undefined} onclick={() => void answer(choice)}>{choice}</button>
						{/each}
					</span>
				{/if}
				<div class="flex flex-wrap items-start gap-2">
					<textarea
						rows="1"
						aria-label="Your answer to your AI"
						value={own}
						placeholder={ask.choices.length > 0 ? 'Or in your own words… (Enter to send)' : 'Your answer… (Enter to send)'}
						class="min-h-9 flex-[1_1_240px] resize-y rounded-lg border-[1.5px] border-evo-control bg-evo-sunken px-2.5 py-2 text-[0.8125rem] leading-normal text-evo-ink outline-none placeholder:text-ink-3 focus:border-blue"
						oninput={(e) => (own = e.currentTarget.value)}
						onkeydown={sendOnEnter}
					></textarea>
					<button
						type="button"
						class="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs {FILLED}"
						title={refusal ?? undefined}
						onclick={() => void answer(own)}><Icon name="sparkles" size={13} /> Send to your AI</button
					>
				</div>
				{#if refusal}
					<span class="font-evo-mono text-[0.6875rem] text-evo-muted">{refusal}</span>
				{/if}
			{/if}
		</div>
	{/if}
</div>
