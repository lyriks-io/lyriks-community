<script lang="ts">
	import { tick } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { discussionHref } from '$domain/discussions';
	import { confirmDialog } from '$ui/design-system';
	import { publishPlaces, chatBusy, wroteSpec, messageWords, type AiChatMessage, type ChatTurn, type MessageDelivery } from '$domain/ai-conversations';
	import { useProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';
	import { NOT_WOKEN } from '$ui/ai-session/ai-standing';
	import { askAct, askHref, startChat } from '$ui/ask/ask-client';
	import AiMessageText from '$ui/ask/AiMessageText.svelte';
	import { groupConversations } from '$ui/ask/ask-groups';
	import { relativeWhen } from '$ui/evolution/relative-when';
	import BlockControls from '$ui/evolution/BlockControls.svelte';
	import RejectCross from '$ui/evolution/RejectCross.svelte';
	import { AI_CONVERSATIONS_SECTION, sectionSyncKey } from '$lib/shared/section-sync';
	import { FIELD, H1, KICK, META, MORE, POP, PRESS_FILL, PRESS_LINE, TAG_ORANGE, TAG_VALID, TAG_LINE, WAIT, WAIT_MARK } from '$ui/spec360/page/look';
	import type { PageData } from './$types';

	/**
	 * Ask my AI (surface cf20b92c): the reader's own conversations with their
	 * AI, latest first, and the open one read as a chat (criteria 13235e8e,
	 * e56b49e5). Under an answer: Publish makes a message a topic on the block
	 * it bears on most (criterion bbab6a2f); a change the AI proposes reads as a
	 * card with Validate and Reject, written only once validated after a new dry
	 * run (criterion 8ec8310b).
	 */
	let { data }: { data: PageData } = $props();
	const ai = useProjectAiSession();
	const projectId = $derived(page.params.projectId ?? '');
	const asked = $derived(page.url.searchParams.get('c'));
	/** The open conversation: the one the address names, else the latest; none for a new one. */
	const fresh = $derived(page.url.searchParams.has('new'));
	const current = $derived(fresh ? null : (data.conversations.find((c) => c.id === asked) ?? (asked ? null : (data.conversations[0] ?? null))));
	const missing = $derived(!!asked && !current);
	const reader = $derived(String(page.data.memberName ?? '').trim() || 'you');

	let draft = $state('');
	let sending = $state(false);
	let thread = $state<HTMLElement | null>(null);
	let field = $state<HTMLTextAreaElement | null>(null);
	const groups = $derived(groupConversations(data.conversations, new Date()));
	const busy = $derived(!!current && chatBusy(current.turn));

	/** The latest message in view, and the field ready, whenever the conversation or its length changes. */
	$effect(() => {
		void current?.id;
		void current?.messages.length;
		void tick().then(() => thread?.scrollTo({ top: thread.scrollHeight }));
	});

	const refresh = () => invalidate(sectionSyncKey(projectId, AI_CONVERSATIONS_SECTION) as `${string}:${string}`);

	/** A conversation whose last word is why the AI stopped, which it opened on its own or not (action 559ba487). */
	const endsStopped = (c: { readonly messages: readonly { readonly stopped?: true }[] }) => !!c.messages[c.messages.length - 1]?.stopped;

	// Opening why the AI stopped reads it: it leaves Needs you (rule fc2ad132). A question stays until answered.
	$effect(() => {
		const shown = current;
		if (!shown?.needsYou || !endsStopped(shown)) return;
		void askAct(projectId, { act: 'seen', conversationId: shown.id }).then(refresh);
	});

	const LABEL: Record<ChatTurn, string> = {
		none: '',
		waiting: 'Waiting',
		taken: 'Your AI is on it',
		answered: 'Answered',
		asked_back: 'Your AI asks you',
		answered_nothing: 'Answered nothing',
		withdrawn: 'Withdrawn'
	};

	async function send() {
		const text = draft.trim();
		if (!text || sending || !ai) return;
		if (busy) return;
		sending = true;
		// No AI listens: the prompt is copied at the press, while the browser allows it (rule 1e796d88), unless a waker starts the AI (action ccca0911).
		const copying = ai.listening || ai.wakes ? null : ai.copyChatPrompt();
		if (current) {
			const done = await askAct(projectId, { act: 'write', conversationId: current.id, text });
			if (done) draft = '';
			await refresh();
		} else {
			const id = await startChat(projectId, text, null);
			if (id) {
				draft = '';
				await goto(askHref(projectId, id));
			}
		}
		await copying;
		await ai.refresh();
		sending = false;
	}

	async function act(body: Record<string, unknown>) {
		const done = await askAct(projectId, body);
		await refresh();
		await ai?.refresh();
		return done;
	}

	/** The message whose Publish box is open, its text and where it goes. */
	let publishing = $state<{ messageId: string; text: string; anchor: string } | null>(null);
	function openPublish(m: AiChatMessage) {
		if (!current) return;
		const places = publishPlaces(current, m.id);
		// A topic reads as plain text: the pages the AI cited read as their names there (criterion 7f4690b0).
		publishing = { messageId: m.id, text: messageWords(m.text), anchor: places[0]?.anchor ?? 'overview:what' };
	}
	async function publish() {
		if (!current || !publishing) return;
		const place = publishPlaces(current, publishing.messageId).find((p) => p.anchor === publishing!.anchor);
		const done = await act({ act: 'publish', conversationId: current.id, messageId: publishing.messageId, anchor: publishing.anchor, title: place?.title ?? '', text: publishing.text });
		if (done) publishing = null;
	}

	function onkey(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void send();
		}
	}

	const status = $derived.by(() => {
		if (!current) return null;
		if (current.turn === 'waiting') {
			if (ai?.listening) return { text: 'Waiting for your AI', cancel: true, prompt: false };
			// A waker starts the reader's AI on the message; once it ran out, the prompt is offered again (criterion 7cfc6440).
			if (ai?.notWoken) return { text: NOT_WOKEN, cancel: true, prompt: true };
			if (ai?.wakes || ai?.waking) return { text: 'Waking your AI', cancel: true, prompt: false };
			return { text: 'Waiting for your AI: no AI listens on this project', cancel: true, prompt: true };
		}
		if (current.turn === 'taken') return { text: ai?.saying ? `Your AI is on it · ${ai.saying}` : 'Your AI is reading', cancel: false, prompt: false };
		if (current.turn === 'answered_nothing') return { text: 'Lyriks answered nothing: write again', cancel: false, prompt: false };
		return null;
	});
	/** What a message of the reader says of its delivery; while no AI listens, a waiting one is not delivered yet. */
	function deliveryLine(state: MessageDelivery | undefined): { text: string; tone: string } {
		switch (state) {
			case 'taken':
				return { text: 'Delivered: your AI is reading', tone: 'text-green-ink' };
			case 'answered':
				return { text: 'Answered', tone: 'text-green-ink' };
			case 'nothing':
				return { text: 'Answered nothing', tone: 'text-orange-ink' };
			case 'withdrawn':
				return { text: 'Withdrawn', tone: '' };
			case 'lost':
				return { text: 'Not delivered: sending it again', tone: 'text-orange-ink' };
			default:
				return ai?.listening ? { text: 'Sent: waiting for your AI', tone: '' } : { text: 'Not delivered yet: no AI listens', tone: 'text-orange-ink' };
		}
	}

	/** Whether the open conversation may be deleted now, and why not (rules a0fbcf19, 6c6dcbf9). */
	const deletable = $derived.by(() => {
		if (!current) return { ok: false, why: '' };
		if (wroteSpec(current)) return { ok: false, why: 'This conversation changed the specification: it is kept as the trace of why.' };
		if (current.turn === 'taken') return { ok: false, why: 'Your AI is on it: wait for its answer, then delete.' };
		return { ok: true, why: '' };
	});

	async function remove() {
		if (!current || !deletable.ok) return;
		const id = current.id;
		if (!(await confirmDialog({ title: 'Delete this conversation?', message: 'It leaves your list for good. A topic published from it stays where it was published.', confirmLabel: 'Delete' }))) return;
		if (await act({ act: 'delete', conversationId: id })) await goto(askHref(projectId));
	}

	const lastPersonMessage = $derived(current ? [...current.messages].reverse().find((m) => m.role !== 'ai') : undefined);

	const PROPOSAL: Record<string, { text: string; tag: string }> = {
		proposed: { text: 'Lands cleanly', tag: TAG_VALID },
		applied: { text: 'Written', tag: TAG_LINE },
		rejected: { text: 'Rejected', tag: TAG_LINE },
		no_longer_lands: { text: 'No longer lands: your AI corrects it', tag: TAG_ORANGE }
	};
</script>

<svelte:head><title>Ask my AI · Lyriks</title></svelte:head>

<div class="flex min-h-0 flex-1 gap-0 max-[800px]:flex-col">
	<!-- The reader's own conversations, latest first (action 55fc34ed). -->
	<aside class="flex w-72 flex-none flex-col gap-2 border-r border-line p-4 max-[800px]:w-full max-[800px]:border-r-0 max-[800px]:border-b" aria-label="My conversations">
		<span class={KICK}>Private · only you read them</span>
		<h1 class="{H1} mt-0 text-[1.5rem]">Ask my AI</h1>
		<a class="{PRESS_LINE} inline-flex min-h-9 items-center justify-center px-3 text-xs" href="{askHref(projectId)}?new">New conversation</a>
		<!-- Needs you first, then by when each last moved (criterion 2ed3cfa4). -->
		<nav class="mt-2 flex min-h-0 flex-col gap-1 overflow-y-auto">
			{#each groups as group (group.label)}
				<span class="{KICK} mt-3 px-2.5 first:mt-0 {group.label === 'Needs you' ? 'text-orange-ink' : ''}">{group.label}</span>
				{#each group.items as c (c.id)}
				<a
					href={askHref(projectId, c.id)}
					aria-current={current?.id === c.id ? 'page' : undefined}
					class="flex flex-col gap-0.5 border-l-[3px] px-2.5 py-2 text-left no-underline {current?.id === c.id ? 'border-violet bg-toner-1' : 'border-transparent hover:bg-toner-1'}"
				>
					<span class="truncate text-[0.875rem] font-semibold text-ink">{c.title}</span>
					<span class="truncate {META} text-xs">{c.context ? c.context.title : 'The product'} · {relativeWhen(c.updatedAt)}</span>
					{#if endsStopped(c)}<span class="text-xs font-semibold {c.needsYou ? 'text-orange-ink' : 'text-ink-3'}">Your AI stopped</span>
					{:else if LABEL[c.turn]}<span class="text-xs font-semibold {c.turn === 'asked_back' ? 'text-orange-ink' : 'text-ink-3'}">{LABEL[c.turn]}</span>{/if}
				</a>
				{/each}
			{:else}
				<span class="text-[0.8125rem] text-ink-3">No conversation yet. Ask from Ask my AI on any page, or write below.</span>
			{/each}
		</nav>
	</aside>

	<section class="flex min-h-0 min-w-0 flex-1 flex-col">
		{#if missing}
			<div class="p-6"><p class="m-0 text-ink-2">Conversation not found</p></div>
		{:else}
			<header class="flex flex-none items-start gap-4 border-b border-line px-6 py-4">
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<h2 class="m-0 text-lg font-bold text-ink">{current ? current.title : 'New conversation about the product'}</h2>
					{#if current?.context}
						<span class={META}>Asked from <a class={MORE} href={current.context.href}>{current.context.title}</a></span>
					{:else if current?.openedBy === 'ai'}
						<span class={META}>Opened by your AI</span>
					{:else if current}
						<span class={META}>About the product as a whole</span>
					{/if}
				</div>
				{#if current}
					<!-- Delete, unless the conversation changed the specification (action 98e5712a, criterion e375c668). -->
					<button
						type="button"
						class="{PRESS_LINE} min-h-8 flex-none px-3 text-xs disabled:cursor-default disabled:opacity-40"
						disabled={!deletable.ok}
						title={deletable.ok ? 'Delete this conversation' : deletable.why}
						onclick={remove}>Delete</button
					>
				{/if}
			</header>

			<div bind:this={thread} class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
				{#each current?.messages ?? [] as m (m.id)}
					{#if m.role === 'person'}
						<div class="flex flex-col items-end gap-1" data-message={m.id}>
							<div class="max-w-[75%] bg-ink px-3.5 py-2.5 text-[0.875rem] whitespace-pre-line text-paper [overflow-wrap:anywhere] {m.withdrawn ? 'opacity-50' : ''}">{m.text}</div>
							<!-- Whether the message reached the AI (criterion 03172878). -->
							<span class="{META} text-xs" data-delivery={current?.delivery[m.id]}
								>{relativeWhen(m.at)} · <span class={deliveryLine(current?.delivery[m.id]).tone}>{deliveryLine(current?.delivery[m.id]).text}</span></span
							>
						</div>
					{:else if m.role === 'lyriks'}
						<div class="self-center border-l-[3px] border-orange bg-orange-tint px-3 py-2 text-xs whitespace-pre-line text-ink-2" data-message={m.id}>{m.text}</div>
					{:else}
						<div class="flex flex-col items-start gap-1.5" data-message={m.id}>
							<span class="text-xs"><b class="text-ink">Lyriks · for {reader}</b> <span class="text-ink-3">{relativeWhen(m.at)}</span></span>
							{#if m.asks}<span class="{TAG_ORANGE}">Your AI asks you</span>{:else if m.stopped}<span class="{TAG_ORANGE}">Your AI stopped</span>{/if}
							<!-- A page the AI cites opens from its name; a link elsewhere reads as plain text (criterion 7f4690b0). -->
							<div class="max-w-[85%] border-[1.5px] border-line bg-paper px-3.5 py-2.5 text-[0.875rem] whitespace-pre-line text-ink [overflow-wrap:anywhere]" data-ai-text
								><AiMessageText text={m.text} origin={page.url.origin} /></div
							>
							{#if m.proposal}
								{@const p = m.proposal}
								<!-- A change of the AI: written only once validated, after a new dry run (criterion 8ec8310b). -->
								<div class="flex max-w-[85%] flex-col gap-2 {POP} p-3.5" data-proposal>
									<span class="flex items-center gap-2"><span class={KICK}>Proposed change</span><span class={PROPOSAL[p.state].tag}>{PROPOSAL[p.state].text}</span></span>
									<span class="text-[0.875rem] text-ink">{p.summary}</span>
									<span class="{META} text-xs">{p.operations.length} operation(s) on {p.featureId}</span>
									{#if p.errors?.length}<span class="text-xs text-red-ink">{p.errors.slice(0, 3).join(' · ')}</span>{/if}
									{#if p.state === 'proposed'}
										<!-- The cross rejects it, the reader's box validates it, as every element of Knowledge (criterion 8ec8310b). -->
										<span class="self-end">
											<BlockControls
												icons
												small
												validate={data.canEdit
													? {
															look: 'grey',
															title: 'Validate this change',
															run: () => act({ act: 'validate', conversationId: current!.id, messageId: m.id }),
															stamps: [{ id: 'own', initials: 'YOU', title: 'You', ok: false, me: true, name: 'You', confirm: { question: 'Validate this change? Lyriks writes it in the specification.', act: 'Validate' } }],
															settled: false
														}
													: null}
											>
												{#snippet reject()}
													<RejectCross name={p.summary} title="Reject it: the specification stays as it is" onclick={() => act({ act: 'reject', conversationId: current!.id, messageId: m.id })} />
												{/snippet}
											</BlockControls>
										</span>
									{/if}
								</div>
							{/if}
							{#if m.published}
								<a class="{MORE} text-xs" href={discussionHref(projectId, m.published.anchor, m.published.threadId)}>Published on {m.published.title}</a>
							{:else if publishing?.messageId === m.id && current}
								<!-- Publish on the closest block, for the people of the project to decide (criterion bbab6a2f). -->
								<div class="flex w-full max-w-[85%] flex-col gap-2 {POP} p-3.5">
									<span class={KICK}>Publish as a topic</span>
									<textarea bind:value={publishing.text} rows="3" aria-label="What is published" class="box-border resize-y {FIELD} px-2.5 py-2 font-[inherit] text-[0.8125rem]"></textarea>
									<span class="flex flex-wrap gap-x-4 gap-y-1">
										{#each publishPlaces(current, m.id) as place (place.anchor)}
											<label class="inline-flex items-center gap-1.5 text-[0.8125rem]">
												<input type="radio" name="place-{m.id}" value={place.anchor} bind:group={publishing.anchor} />
												{place.title}{#if place.suggested}<span class="{META} text-xs">Suggested</span>{/if}
											</label>
										{/each}
									</span>
									<span class="flex gap-2">
										<button type="button" class="{PRESS_FILL} min-h-8 px-3 text-xs" onclick={publish}>Publish</button>
										<button type="button" class="{PRESS_LINE} min-h-8 px-3 text-xs" onclick={() => (publishing = null)}>Cancel</button>
									</span>
								</div>
							{:else}
								<button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-xs text-ink-3 underline" onclick={() => openPublish(m)}>Publish</button>
							{/if}
						</div>
					{/if}
				{/each}
				{#if !current}
					<p class="m-0 text-[0.875rem] text-ink-3">Ask about the product as a whole. To ask about a page, use Ask my AI at the foot of the navigation while you read it.</p>
				{/if}
			</div>

			<footer class="flex flex-none flex-col gap-2 border-t border-line px-6 py-3">
				{#if status}
					<span class={WAIT}>
						<span class={WAIT_MARK} aria-hidden="true"></span>
						{status.text}
						{#if status.prompt}
							<!-- The prompt that opens a session, offered again while no AI listens (action 164257ae). -->
							<button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-ink underline" onclick={() => ai?.copyChatPrompt()}>Copy the prompt</button>
						{/if}
						{#if status.cancel && lastPersonMessage && current}
							<button
								type="button"
								class="cursor-pointer border-0 bg-transparent p-0 text-xs text-ink-3 underline"
								onclick={() => act({ act: 'withdraw', conversationId: current!.id, messageId: lastPersonMessage!.id })}>Cancel</button
							>
						{/if}
					</span>
				{/if}
				<div class="flex items-end gap-2">
					<textarea
						bind:this={field}
						bind:value={draft}
						rows="2"
						aria-label="Your message"
						disabled={busy}
						placeholder={busy ? 'Your AI is still on your last message.' : 'Your message… (Enter to send, Shift+Enter for a new line)'}
						onkeydown={onkey}
						class="box-border min-h-[52px] flex-1 resize-y {FIELD} px-2.5 py-2 font-[inherit] text-[0.875rem]"
					></textarea>
					<button type="button" class="{PRESS_FILL} min-h-9 px-4 text-xs" disabled={busy || sending} onclick={send}>Send</button>
				</div>
				{#if ai?.refusal}<span class="text-xs text-ink-3">{ai.refusal}</span>{/if}
			</footer>
		{/if}
	</section>
</div>
