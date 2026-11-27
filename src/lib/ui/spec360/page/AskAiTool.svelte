<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pushToast, clickedWithin, confirmDialog, floatInView } from '$ui/design-system';
	import { useProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';
	import { aiSessionSlot } from '$ui/ai-session/ai-session-slot.svelte';
	import { aiStanding, withWaiting } from '$ui/ai-session/ai-standing';
	import { QUIET_WHY } from '$ui/ai-session/approvals';
	import { intoSideAsk, intoSideAskElse } from '$ui/shell/side-ask';
	import { askHref, startChat, pageTitle } from '$ui/ask/ask-client';
	import { FIELD, POP, PRESS_FILL } from './look';

	/**
	 * Ask my AI (criterion 44aa7b4f): the box at the foot of the navigation,
	 * right above Help & support. A page of Knowledge declares it with the block
	 * its question bears on (intoSideAsk); the project's layout keeps one for
	 * every other page, which asks about the page itself (`onPage`,
	 * intoSideAskElse, rule 8ddf1393). Ask opens a private conversation with the
	 * reader's own AI carrying that page as its context, and goes to it on the
	 * Ask my AI page (action 336e9466, criterion cc5f46cb); without a session the
	 * prompt that opens one is copied and the message waits for it. It is also
	 * the one place that says whether the reader's AI is connected (criterion
	 * 4cb97f74): a mark and a word under its name, and in session the box lists
	 * each AI of the reader, newest first, with since when, what it does and an
	 * End of its own (action dd8370af, criterion 39e1abc1, EVO-015).
	 */
	interface Props {
		/** The block the question bears on; none on a page that names no block. */
		anchor?: string;
		/** What that block is called. */
		title?: string;
		/** What the box says it asks about; the block's title by default. */
		subject?: string;
		/** The project's own box, for a page that put none of its own. */
		onPage?: boolean;
	}
	let { anchor, title = '', subject, onPage = false }: Props = $props();
	const ai = useProjectAiSession();
	const onAskPage = $derived(page.url.pathname.endsWith('/ask'));
	const reading = $derived(onPage ? (onAskPage ? 'the product' : 'this page') : (subject ?? title));

	const base = $derived(aiStanding(ai, aiSessionSlot.run));
	// The AI's own question, or why it stopped, waits on the reader: the word says Needs you, on every page (criterion 31488628).
	const waiting = $derived(ai?.needsYou ?? null);
	const standing = $derived(withWaiting(base, waiting?.latest ?? null));
	const inSession = $derived(base.tone === 'connecting' || base.tone === 'listening' || base.tone === 'working');

	// The times are the reader's own, which only the browser knows.
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const clock = (at: string | null | undefined) => {
		const date = at ? new Date(at) : null;
		return mounted && date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
	};
	const since = $derived(clock(ai?.session?.startedAt));
	// One line per AI in session, each saying what it does in the words of the button (criterion 39e1abc1).
	const ais = $derived(
		(ai?.aiSessions ?? []).map((one) => ({ ...one, since: clock(one.startedAt), doing: aiStanding({ isOpen: true, ...one }, null).doing ?? 'connecting' }))
	);
	const lastCall = $derived(clock(aiSessionSlot.run?.seenAt));
	const quietSince = $derived(lastCall ? `No call from your AI since ${lastCall}.` : 'No call from your AI for a minute.');
	const tip = $derived(
		standing.tone === 'needs' ? `Your AI ${standing.doing}` : inSession ? `Your AI is in session${since ? ` since ${since}` : ''}, ${standing.doing}` : standing.word
	);

	// In session, the project's own box reads the server again each minute: a session its AI left ends there (criterion 39e1abc1).
	const RECHECK_MS = 60_000;
	onMount(() => {
		if (!onPage) return;
		const timer = setInterval(() => {
			if (ai?.isOpen) void ai.refresh();
		}, RECHECK_MS);
		return () => clearInterval(timer);
	});

	async function endSession(sessionId?: string) {
		open = false;
		if (
			await confirmDialog({
				title: 'End the session?',
				message: 'Your AI stops waiting for your clicks. The clicks it has not answered go to another of your AIs, or wait for your next session.',
				confirmLabel: 'End the session'
			})
		)
			await ai?.end(sessionId);
	}

	let open = $state(false);
	let question = $state('');
	let sending = $state(false);
	let root = $state<HTMLElement | null>(null);
	let panel = $state<HTMLDivElement | undefined>();
	let field = $state<HTMLTextAreaElement | null>(null);

	async function show() {
		open = true;
		await tick();
		field?.focus();
	}

	function toggle() {
		if (open) open = false;
		else void show();
	}

	/** The page the question is asked from: the block on a page of Knowledge, else the page itself; none from Ask my AI. */
	function context() {
		if (onPage && onAskPage) return null;
		const href = `${page.url.pathname}${page.url.search}`;
		return anchor ? { anchor, title: subject ?? title, href } : { title: pageTitle(document.title), href };
	}

	async function ask() {
		if (!ai || sending) return;
		const text = question.trim();
		if (!text) return void pushToast({ level: 'info', message: 'Write your question first' });
		sending = true;
		// No AI listens: the prompt is copied at the press, while the browser allows it (rule 1e796d88).
		const copying = ai.listening ? null : ai.copyChatPrompt();
		const started = await startChat(ai.projectId, text, context());
		sending = false;
		await copying;
		if (!started) return;
		question = '';
		open = false;
		await goto(askHref(ai.projectId, started));
		await ai.refresh();
	}

	function onkey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			open = false;
		} else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void ask();
		}
	}
</script>

<svelte:window onpointerdown={(e) => open && !clickedWithin(e.target, root, panel) && (open = false)} />

{#snippet spark()}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"
		><path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z"></path><path d="M18.5 15.5v5M16 18h5"></path></svg
	>
{/snippet}

{#if ai}
	<span class="ask-side relative flex" bind:this={root} {@attach onPage ? intoSideAskElse : intoSideAsk}>
		<!-- A row of the navigation in its orange frame (.ask-row, SideFoot); folded, its spark alone, named on hover (criterion 44aa7b4f). -->
		<button type="button" class="si ask-row" aria-expanded={open} aria-haspopup="dialog" aria-label="Ask my AI about {reading}. {tip}" data-tip="Ask my AI · {standing.word}" title={tip} onclick={toggle}
			><span class="lab">{@render spark()}<span class="txt">Ask my AI</span></span><span class="ai-st" data-tone={standing.tone}
				><span class="ai-dot" aria-hidden="true"></span><span class="txt">{standing.word}</span></span
			></button
		>
		{#if open}
			<div
				bind:this={panel}
				use:floatInView={{ anchor: root, align: 'left', prefer: 'above' }}
				role="dialog"
				aria-label="Ask your AI about {reading}"
				class="flex w-[360px] max-w-[calc(100vw-32px)] animate-lk-in-fast flex-col gap-2.5 {POP} p-3.5 text-left"
			>
				<!-- What the reader's AI asked them on its own, or why it stopped: one press away (actions 385983f9, 559ba487). -->
				{#if waiting?.latest}
					<a
						class="flex flex-col gap-1 border-b border-line pb-2.5 text-[0.8125rem] no-underline"
						href={askHref(ai.projectId, waiting.latest.conversationId)}
						data-needs-you={waiting.latest.conversationId}
						onclick={() => (open = false)}
						><span class="flex items-center gap-2 font-bold text-orange-ink"
							><span class="size-2 flex-none bg-orange" aria-hidden="true"></span>{waiting.latest.about === 'question' ? 'Your AI asks you' : 'Your AI stopped'}{waiting.count > 1
								? ` · ${waiting.count} wait on you`
								: ''}</span
						><span class="line-clamp-3 leading-normal text-ink-2">{waiting.latest.text}</span><span class="text-xs text-ink-3 underline"
							>{waiting.latest.about === 'question' ? 'Answer it' : 'Read it'}</span
						></a
					>
				{/if}
				<!-- Where the reader's AI stands (action dd8370af, criteria 39e1abc1, bc0f0767). -->
				{#if inSession && ais.length > 0}
					<div class="border-b border-line pb-2.5 text-[0.8125rem]" role="status" aria-live="polite">
						<ul class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your AIs in session">
							{#each ais as one (one.id)}
								<li class="flex flex-col gap-1" data-ai-session={one.id}>
									<span class="flex items-center gap-2 font-bold text-green-ink"
										><span class="ai-mark" data-alive={one.status === 'thinking' || one.status === 'writing' || undefined} aria-hidden="true"></span>{one.name}{' '}<span
											class="font-normal text-ink-3">in session{one.since ? ` since ${one.since}` : ''}</span
										></span
									>
									<span class="leading-normal text-ink-2">Now: {one.doing}.</span>
									<button type="button" class="quiet self-start text-xs text-red-ink" onclick={() => endSession(one.id)}>End the session</button>
								</li>
							{/each}
						</ul>
					</div>
				{:else if inSession}
					<div class="flex flex-col gap-1 border-b border-line pb-2.5 text-[0.8125rem]" role="status" aria-live="polite">
						<span class="flex items-center gap-2 font-bold text-green-ink"
							><span class="ai-mark" data-alive={base.tone === 'working' || undefined} aria-hidden="true"></span>Your AI is in session{since ? ` since ${since}` : ''}</span
						>
						<span class="leading-normal text-ink-2">Now: {base.doing}.</span>
						<button type="button" class="quiet self-start text-xs text-red-ink" onclick={() => endSession()}>End the session</button>
					</div>
				{:else if base.tone === 'quiet'}
					<div class="flex flex-col gap-1 border-b border-line pb-2.5 text-[0.8125rem]" role="status">
						<span class="flex items-center gap-2 font-bold"><span class="size-2 flex-none bg-orange" aria-hidden="true"></span>Check your AI</span>
						<span class="leading-normal text-ink-2">{quietSince} {QUIET_WHY}</span>
					</div>
				{:else if base.tone === 'run'}
					<span class="border-b border-line pb-2.5 text-[0.8125rem] text-green-ink" role="status">Your AI is working on the Reverse-Specification.</span>
				{/if}
				<label class="flex flex-col gap-1.5">
					<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">Ask your AI about {reading}</span>
					<textarea
						bind:this={field}
						bind:value={question}
						rows="3"
						placeholder="Your question… (Enter to ask, Shift+Enter for a new line)"
						onkeydown={onkey}
						class="box-border min-h-[72px] resize-y {FIELD} px-2.5 py-2 font-[inherit] text-[0.8125rem]"
					></textarea>
				</label>
				<span class="flex items-center gap-3">
					<span class="min-w-0 flex-1 text-xs leading-snug text-ink-3">{ai.refusal ?? 'Opens a private conversation with your AI.'}</span>
					<button type="button" class="{PRESS_FILL} inline-flex h-8 flex-none items-center gap-1.5 px-3 text-[0.6875rem]" disabled={sending} onclick={ask}>Ask</button>
				</span>
				<a class="self-start text-xs text-ink-3 underline" href={askHref(ai.projectId)} onclick={() => (open = false)}>My conversations</a>
			</div>
		{/if}
	</span>
{/if}

<style>
	/* Where the reader's AI stands, under Ask my AI (criterion 4cb97f74): a mark and a word at the row's end; folded, the
	   mark alone on the spark. Grey not connected, green breathing in session, green moving at work, orange pulsing to check. */
	.ai-st {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-ink-4);
	}
	.ai-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-ink-4);
	}
	.ai-st:is([data-tone='connecting'], [data-tone='listening'], [data-tone='working'], [data-tone='run']) {
		color: var(--color-green);
	}
	.ai-st:is([data-tone='connecting'], [data-tone='listening']) .ai-dot {
		background: var(--color-green);
		animation: lk-ai-breathe 2.8s ease-in-out infinite;
	}
	.ai-st:is([data-tone='working'], [data-tone='run']) .ai-dot {
		background: var(--color-green);
		animation: lk-pulse 0.9s ease-in-out infinite;
	}
	.ai-st:is([data-tone='quiet'], [data-tone='needs']) {
		color: var(--color-orange);
	}
	.ai-st[data-tone='needs'] .ai-dot {
		background: var(--color-orange);
		animation: lk-pulse 1.4s ease-in-out infinite;
	}
	.ai-st[data-tone='quiet'] .ai-dot {
		border-radius: 0;
		background: var(--color-orange);
		animation: lk-pulse 1.4s ease-in-out infinite;
	}
	:global(.lk-side.folded) .ai-st {
		position: absolute;
		top: 7px;
		right: 9px;
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.ai-dot {
			animation: none !important;
		}
	}
</style>
