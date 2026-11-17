<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { untrack } from 'svelte';
	import { Icon, pushToast } from '$ui/design-system';
	import { pointsOf, suggestionPlaceOf, threadBoxOf, topicOf, waitingQuestionOf, type FieldThreadMessage } from '$domain/evolution';
	import { personName } from './people';
	import { conversationsOf } from './thread-conversations';
	import { relativeWhen } from './relative-when';
	import LiveClickProgress from './LiveClickProgress.svelte';
	import type { ThreadAsk } from './live-session.svelte';
	import { OptimisticActs } from './optimistic-acts.svelte';
	import { requirementKindOf, requirementSectionOf } from './requirement-kinds';
	import { useRequestLanguage } from './request-language.svelte';
	import { LLM_BADGE, SUGGESTED } from './evo-look';

	/**
	 * The conversations about one answer, read as topics (ac-evo-fthread-look):
	 * each message of its own opens a topic, with who wrote it, their job, when,
	 * and where it stands, Open, Validated or Resolved, its replies under it.
	 * A person replies to a topic, validates it, resolves it or reopens it; the
	 * resolved ones fold behind one link. A new topic is written at the foot.
	 * Enter sends, Shift+Enter starts a new line (ac-evo-fthread-enter).
	 *
	 * A new topic offers Comment, which never reaches the AI, and 'Ask your AI',
	 * always shown on a request page: it reaches the reader's AI in a session of
	 * their own, and without one copies the prompt that opens it, the question
	 * waiting for it. Every reply has one send, Reply: in a conversation the AI
	 * takes part in it is asking the AI, between people it stays among them
	 * (ac-evo-live-one-box). A topic the AI opened is replied to or resolved,
	 * never validated, and the box to answer the AI's waiting question is open
	 * under it. Once the thread holds a topic, the box to start another stays
	 * behind Add a comment (criterion 6ef1230e).
	 *
	 * A message of the AI may carry a suggestion (ac-evo-live-comment-suggests):
	 * its texts shown as the Solution tab shows them, each line with its kind,
	 * under the section it would write, with Accept, which writes them, and
	 * Refuse. A resolved topic offers no box to reply (ac-evo-fthread-resolved-closed);
	 * Reply opens the box under the topic's last reply and brings it into view
	 * (ac-evo-fthread-reply-in-view).
	 *
	 * Every act reads at once (ac-evo-form-edit-optimistic): a message sent shows
	 * in the thread and its box empties, a ruling and a message made a comment
	 * show as given, while they save. A save that fails takes them off again and
	 * puts what was written back in its box.
	 */
	interface Message {
		readonly id: string;
		readonly author: string;
		readonly authorKind: string;
		readonly body: string;
		readonly postedAt: string;
		readonly earlier?: readonly { readonly body: string; readonly at: string }[];
		readonly editedAt?: string;
		/** The message of the thread this one answers (ac-evo-fthread-reply). */
		readonly replyTo?: string;
		/** How a person settled the topic this message opened. */
		readonly ruling?: { readonly state: 'validated' | 'resolved'; readonly by: string; readonly at: string };
		/** An exchange with the reader's own AI nobody else reads yet (ac-evo-live-ask). */
		readonly privateTo?: string;
		/** The AI's reply asks the reader something (ac-evo-live-scope). */
		readonly awaitsAnswer?: true;
		/** The answers that question offers as buttons, and whether it takes several (ac-evo-live-choices). */
		readonly choices?: readonly string[];
		readonly multiple?: true;
		/** Sent to the reader's AI from this page and not read back yet. */
		readonly asking?: true;
		/** The texts the AI offers, each at its place, and how a person decided them (ac-evo-live-comment-suggests). */
		readonly suggests?: readonly { readonly fieldPath: string; readonly value: string }[];
		readonly suggestion?: { readonly state: 'accepted' | 'refused'; readonly by: string; readonly at: string };
	}
	type Ruling = 'validated' | 'resolved' | 'open';
	interface Props {
		/** The question discussed, for the accessible name. */
		label: string;
		messages: readonly Message[];
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[] }[];
		/** Who is reading. */
		actorId: string;
		canComment: boolean;
		/** Opened on purpose by the reader: the caret goes in the box of a new topic when nothing is said yet. */
		focusOnOpen?: boolean;
		/** Posts a topic of its own, or a reply to the topic named (ac-evo-fthread-reply). */
		onpost: (body: string, replyTo: string | null) => Promise<boolean>;
		/** Validates, resolves or reopens a topic: a person's ruling. */
		onrule?: (messageId: string, ruling: Ruling) => Promise<boolean>;
		/**
		 * The reader's own AI, on a request page (ac-evo-live-ask): a message sent
		 * through `run` is posted in the thread addressed to it, and it answers in
		 * reply. `refusal` says why it reads greyed (no session yet); `clickOf` the click a message asked.
		 */
		ask?: ThreadAsk | null;
		/** Make it a comment: publishes the reader's exchange with their AI (ac-evo-live-ask). */
		onpublish?: ((messageId: string) => Promise<boolean>) | null;
		/** Accepts or refuses the suggestion of a message; absent for who may not write (ac-evo-live-comment-suggests). */
		ondecide?: ((messageId: string, decision: 'accept' | 'refuse') => Promise<boolean>) | null;
	}
	let { label, messages: saved, members, actorId, canComment, focusOnOpen = false, onpost, onrule, ask = null, onpublish = null, ondecide = null }: Props = $props();

	/** Messages sent, rulings given and exchanges made comments, read before the server has answered. */
	const posting = new OptimisticActs<Message>();
	const ruling = new OptimisticActs<Ruling>();
	const publishing = new OptimisticActs<true>();

	const messages = $derived([
		...saved.map((m) => (publishing.of(m.id) && m.privateTo ? { ...m, privateTo: undefined } : m)),
		...Object.values(posting.all)
	]);
	let sentCount = 0;

	const nameOf = (id: string) => personName(id, members);
	const isAi = (message: Message) => message.authorKind === 'ai_client';
	/** What a person does in the team, said beside their name: their job, else their role. */
	const roleOf = (id: string) => {
		const member = members.find((m) => m.id === id);
		return member?.jobs?.length ? member.jobs.join(', ') : member?.role && member.role !== 'member' ? member.role : '';
	};
	const STATUS: Record<Ruling, string> = { open: 'Open', validated: '✓ Validated', resolved: 'Resolved' };

	const topics = $derived(conversationsOf(messages).map((c) => ({ ...c, ruling: ruling.of(c.opener.id) ?? ((c.opener.ruling?.state ?? 'open') as Ruling) })));
	const active = $derived(topics.filter((t) => t.ruling !== 'resolved'));
	const resolved = $derived(topics.filter((t) => t.ruling === 'resolved'));
	let showResolved = $state(false);
	const shown = $derived(showResolved ? [...active, ...resolved] : active);

	/** The topic whose reply box is open, and what is typed in it. */
	let replyingTo = $state<string | null>(null);
	/** Reply was clicked: the box it opens comes into view with the caret in it (ac-evo-fthread-reply-in-view). */
	let bringReply = false;
	function toggleReply(openerId: string) {
		bringReply = replyingTo !== openerId;
		replyingTo = bringReply ? openerId : null;
	}
	const replyIntoView = (box: HTMLTextAreaElement) => {
		if (!bringReply) return;
		bringReply = false;
		box.focus({ preventScroll: true });
		box.scrollIntoView({ block: 'nearest', behavior: scrollMotion() });
	};
	let reply = $state('');
	let topic = $state('');
	let topicBox: HTMLTextAreaElement | undefined = $state();
	let focusTopic = $state(untrack(() => focusOnOpen && saved.length === 0));
	/** Add a comment was clicked: the box to start a topic shows under the topics the thread holds (criterion 6ef1230e). */
	let composing = $state(false);
	const topicBoxShown = $derived(topics.length === 0 || composing);
	function addComment() {
		composing = true;
		focusTopic = true;
	}
	/** Cancel, or Escape: the box folds back to the link, what was typed dropped, nothing posted (criterion 6ef1230e). */
	function cancelComment() {
		topic = '';
		composing = false;
	}
	$effect(() => {
		if (focusTopic && topicBox) {
			topicBox.focus();
			focusTopic = false;
		}
	});

	/** Whether a box replies to the reader's AI with one Reply (ac-evo-live-one-box). */
	const boxOf = (openerId: string | null) => threadBoxOf(messages, openerId, !!ask);
	const enterToAi = (openerId: string | null) => boxOf(openerId).replyToAi;
	/** What a reply in a conversation answers: the AI's question waiting there, else its latest message (ac-evo-fthread-reply). */
	function replyTargetOf(openerId: string): string {
		if (waiting && topicOf(messages, waiting.id) === openerId) return waiting.id;
		const inTopic = messages.filter((m) => topicOf(messages, m.id) === openerId);
		return inTopic.reduce((latest, m) => (m.postedAt >= latest.postedAt ? m : latest), inTopic[0])?.id ?? openerId;
	}
	/**
	 * Sends to the reader's AI, or as a comment the people who read the thread
	 * see: the message reads in the thread at once, until the thread read back
	 * holds it; false once it failed, the message gone again.
	 */
	async function send(body: string, openerId: string | null, toAi: boolean): Promise<boolean> {
		const replyTo = openerId ? replyTargetOf(openerId) : null;
		// Without a session of the reader's own, the ask waits for the one the copied prompt opens (ac-evo-live-no-session).
		if (toAi && !ask) return false;
		const key = `sent:${++sentCount}`;
		const message: Message = {
			id: key,
			author: actorId,
			authorKind: 'person',
			body,
			postedAt: new Date().toISOString(),
			...(replyTo ? { replyTo } : {}),
			...(toAi ? { privateTo: actorId, asking: true as const } : {})
		};
		const sent = await posting.run(key, message, () => (toAi && ask ? ask.run(body, replyTo) : onpost(body, replyTo)), () => saved);
		// The message shows in the thread it was written in, so it raises no message (criterion 8b431894).
		return sent;
	}
	/** What was written goes back in its box when its sending failed, before anything typed since. */
	const putBack = (body: string, now: string) => (now.trim() === '' ? body : `${body}\n${now}`);
	async function openTopic(toAi: boolean) {
		const body = topic.trim();
		if (body === '') return pushToast({ level: 'info', message: 'Write your message first' });
		topic = '';
		if (await send(body, null, toAi)) composing = false;
		else topic = putBack(body, topic);
	}
	async function sendReply(openerId: string, toAi: boolean) {
		const body = reply.trim();
		if (body === '') return pushToast({ level: 'info', message: 'Write your reply first' });
		reply = '';
		replyingTo = null;
		if (await send(body, openerId, toAi)) return;
		reply = putBack(body, replyingTo === openerId ? reply : '');
		replyingTo = openerId;
	}
	const ASK_STATE: Record<string, string> = {
		waiting: 'Asked your AI · waiting',
		answered: 'Lyriks answered',
		cancelled: 'Cancelled · what Lyriks wrote for it is undone'
	};

	/** The AI's question still waiting for the reader in this thread (ac-evo-live-scope). */
	const waiting = $derived(waitingQuestionOf(messages as FieldThreadMessage[], actorId));
	// The box to answer it opens under it, once per question: closing it is the reader's choice (ac-evo-live-one-box).
	let openedFor = $state<string | null>(null);
	$effect(() => {
		const question = waiting;
		untrack(() => {
			if (!question || !canComment || openedFor === question.id) return;
			openedFor = question.id;
			if (replyingTo === null) replyingTo = topicOf(messages, question.id);
		});
	});
	/** A message of the reader's exchange with their AI that opens it: the place to make it a comment. */
	const opensExchange = (message: Message) =>
		message.privateTo === actorId && !messages.find((m) => m.id === message.replyTo)?.privateTo;

	/** Reply there: what the reader started as a new topic goes under the question their AI asked (ac-evo-live-scope). */
	function replyThere() {
		if (!waiting) return;
		reply = topic;
		topic = '';
		replyingTo = topicOf(messages, waiting.id);
	}
	/** The answers the reader ticked on a question that takes several (ac-evo-live-choices). */
	let ticked = $state<Record<string, string[]>>({});
	const toggleTick = (messageId: string, choice: string) => {
		const now = ticked[messageId] ?? [];
		ticked = { ...ticked, [messageId]: now.includes(choice) ? now.filter((c) => c !== choice) : [...now, choice] };
	};
	/** A click on an answer of the AI's question is the reply: it reaches the AI like Reply does (ac-evo-live-choices). */
	async function answerWith(message: Message, picked: readonly string[]) {
		if (picked.length === 0) return;
		const topic = topicOf(messages, message.id);
		ticked = { ...ticked, [message.id]: [] };
		if (!(await send(picked.join(', '), topic, boxOf(topic).replyToAi))) ticked = { ...ticked, [message.id]: [...picked] };
	}
	// The design's filter chip (.ly-chip) for an answer to pick: a line border on paper; picked, an ink fill.
	const CHOICE = 'min-h-8 border-[1.5px] px-3 text-xs font-semibold disabled:opacity-50';
	const CHOICE_OFF = 'border-line bg-paper text-ink hover:border-ink';
	const CHOICE_ON = 'border-ink bg-ink text-paper';

	async function publish(messageId: string) {
		const make = onpublish;
		if (!make) return;
		if (await publishing.run(messageId, true, () => make(messageId), () => saved)) pushToast({ level: 'success', message: 'Made a comment: everyone who reads the thread sees it' });
	}

	async function rule(openerId: string, given: Ruling) {
		const settle = onrule;
		if (!settle) return;
		// A resolved topic takes no reply: its box closes with it (ac-evo-fthread-resolved-closed).
		if (given === 'resolved' && replyingTo === openerId) replyingTo = null;
		// A validated comment shows so in place; a resolved topic folds away, so that one says it (criterion 8b431894).
		if ((await ruling.run(openerId, given, () => settle(openerId, given), () => saved)) && given === 'resolved')
			pushToast({ level: 'success', message: 'Comment resolved' });
	}

	/** The places of a suggestion as the Solution tab shows them: per section, each line with its kind (ac-evo-live-comment-suggests). */
	const language = useRequestLanguage();
	function suggestionSections(writes: NonNullable<Message['suggests']>) {
		const sections: { title: string; lines: { kind: string; text: string }[] }[] = [];
		for (const write of writes) {
			const place = suggestionPlaceOf(write.fieldPath);
			if (!place) continue;
			const section = requirementSectionOf(place.step);
			const title = `${section.number} ${section.title}`;
			const kind = requirementKindOf(language(), place.step, place.kind === 'description' ? 'description' : place.key) ?? '';
			let group = sections.find((g) => g.title === title);
			if (!group) sections.push((group = { title, lines: [] }));
			group.lines.push(...pointsOf(write.value).map((text) => ({ kind, text })));
		}
		return sections;
	}
	const suggestionOf = (message: Message) => message.suggestion?.state ?? 'waiting';

	/** Enter sends, Shift+Enter starts a new line (ac-evo-fthread-enter). */
	function sendOnEnter(e: KeyboardEvent, action: () => void) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		e.preventDefault();
		action();
	}

	// The design's buttons, small: unfilled (.ly-btn), filled (.ly-btn--fill); the field (.ly-input).
	const OUTLINE = 'pressable min-h-9 rounded-lg border-[1.5px] border-ink bg-transparent px-2.5 text-xs font-bold tracking-[0.07em] text-evo-ink uppercase disabled:opacity-40';
	const FILLED = 'pressable border-[1.5px] border-ink bg-evo-violet font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40';
	const SEND = 'inline-flex min-h-9 items-center gap-1 rounded-lg border-[1.5px] px-3 text-xs font-bold tracking-[0.07em] uppercase disabled:opacity-40';
	const BOX = 'min-h-9 resize-y rounded-lg border-[1.5px] border-evo-control bg-evo-sunken px-2.5 py-2 text-[0.8125rem] leading-normal text-evo-ink outline-none placeholder:text-ink-3 focus:border-blue';
</script>

<section class="animate-lk-in-fast flex flex-col gap-2 border-t border-line pt-3" aria-label="Comments on {label}" data-comments>
	{#if active.length === 0}
		<span class="text-[0.8125rem] text-evo-muted italic">No open topics.</span>
	{/if}
	{#each shown as t (t.opener.id)}
		<div
			class="flex flex-wrap items-start gap-2.5 rounded-lg border bg-evo-sunken px-2.5 py-2 {t.ruling === 'resolved'
				? 'border-line opacity-70'
				: t.ruling === 'validated'
					? 'border-green'
					: 'border-orange'}"
		>
			<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5 text-[0.8125rem] leading-normal">
				{@render messageBody(t.opener, t.ruling)}
				{#each t.replies as r (r.id)}
					<div class="mt-2 flex flex-col gap-px border-t border-evo-line pt-2">
						{@render messageBody(r, null)}
					</div>
				{/each}
			</div>
			<span class="flex flex-wrap gap-1">
				{#if canComment && t.ruling !== 'resolved'}
					<button type="button" class={OUTLINE} aria-expanded={replyingTo === t.opener.id} onclick={() => toggleReply(t.opener.id)}>
						{t.replies.length > 0 ? `Reply (${t.replies.length})` : 'Reply'}
					</button>
				{/if}
				{#if canComment && onrule}
					{#if t.ruling === 'open' && !isAi(t.opener)}
						<button type="button" class={OUTLINE} onclick={() => rule(t.opener.id, 'validated')}>Validate</button>
					{/if}
					{#if t.ruling !== 'resolved'}
						<button type="button" class={OUTLINE} onclick={() => rule(t.opener.id, 'resolved')}>Resolve</button>
					{:else}
						<button type="button" class={OUTLINE} onclick={() => rule(t.opener.id, 'open')}>Reopen</button>
					{/if}
				{/if}
			</span>
			{#if replyingTo === t.opener.id && t.ruling !== 'resolved'}
				<div class="animate-lk-in-fast flex basis-full flex-wrap items-start gap-2">
					<textarea
						{@attach replyIntoView}
						rows="1"
						aria-label="Reply"
						value={reply}
						placeholder={enterToAi(t.opener.id) ? 'Your answer to your AI… (Enter to send it to your AI)' : 'Your reply… (Enter to send)'}
						class="{BOX} flex-[1_1_280px]"
						oninput={(e) => (reply = e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === 'Escape') replyingTo = null;
							else sendOnEnter(e, () => void sendReply(t.opener.id, enterToAi(t.opener.id)));
						}}
					></textarea>
					{@render sendButtons(t.opener.id)}
				</div>
			{/if}
		</div>
	{/each}
	{#if resolved.length > 0}
		<button type="button" class="min-h-8 self-start text-[0.8125rem] font-semibold text-evo-ink underline decoration-[1.5px] underline-offset-4" onclick={() => (showResolved = !showResolved)}>
			{showResolved ? 'Hide resolved comments' : `Show ${resolved.length} comment(s) resolved`}
		</button>
	{/if}
	{#if canComment && !topicBoxShown}
		<!-- The thread holds a topic: the box to start another waits behind one link (criterion 6ef1230e). -->
		<button type="button" class="min-h-8 self-start text-[0.8125rem] font-semibold text-evo-ink underline decoration-[1.5px] underline-offset-4" onclick={addComment}>Add a comment</button>
	{:else if canComment}
		<div class="flex flex-wrap items-start gap-2">
			<textarea
				bind:this={topicBox}
				rows="1"
				aria-label="Open a new topic"
				value={topic}
				placeholder={ask ? 'Write a comment, or ask your AI… (Enter to comment, Shift+Enter for a new line)' : 'Open a new topic… (Enter to send, Shift+Enter for a new line)'}
				class="{BOX} flex-[1_1_320px]"
				oninput={(e) => (topic = e.currentTarget.value)}
				onkeydown={(e) => (e.key === 'Escape' && composing ? cancelComment() : sendOnEnter(e, () => void openTopic(false)))}
			></textarea>
			{@render sendButtons(null)}
			{#if composing}
				<button type="button" class="min-h-9 px-1 text-xs font-semibold text-evo-muted underline-offset-4 hover:underline" onclick={cancelComment}>Cancel</button>
			{/if}
		</div>
		{#if waiting && topic.trim() !== ''}
			<!-- A new topic while the AI's question waits: offer to answer it where it was asked (ac-evo-live-scope). -->
			<p class="m-0 flex flex-wrap items-center gap-2 text-xs text-evo-ink-3" role="status">
				Lyriks asked you something in this thread: “{waiting.body.length > 90 ? `${waiting.body.slice(0, 90)}…` : waiting.body}”
				<button type="button" class="font-semibold text-violet-ink underline decoration-[1.5px] underline-offset-2" onclick={replyThere}>Reply there</button>
			</p>
		{/if}
	{/if}
</section>

{#snippet messageBody(message: Message, ruling: Ruling | null)}
	{@const ai = isAi(message)}
	{@const role = ai ? `for ${nameOf(message.author)}` : roleOf(message.author)}
	{@const answered = message.replyTo ? messages.find((m) => m.id === message.replyTo) : undefined}
	<!-- A person by their name, an AI client said as such and for whom (ac-evo-form-names, ac-evo-fthread-1). -->
	<span class="group">
		<b class="font-bold text-evo-ink">{ai ? 'AI assistant' : nameOf(message.author)}</b>
		<span class="font-evo-mono text-xs text-evo-muted">
			{role ? `· ${role} ` : ''}· <time datetime={message.postedAt}>{relativeWhen(message.postedAt)}</time>{ruling ? ` · ${STATUS[ruling]}` : ''}{message.editedAt ? ' · edited' : ''}
		</span>
	</span>
	{#if answered}
		<!-- Every reply says whom it answers, the reader's as the AI's (ac-evo-fthread-reply). -->
		<span class="font-evo-mono text-[0.6875rem] text-evo-muted">↳ to {isAi(answered) ? 'the AI assistant' : nameOf(answered.author)}</span>
	{/if}
		<span class="whitespace-pre-line break-words {ruling === 'resolved' ? 'text-evo-muted' : 'text-evo-ink'}">{message.body}</span>
	{#if message.suggests?.length}
		{@render suggestionCard(message, message.suggests)}
	{/if}
	{#if message.privateTo || waiting?.id === message.id}
		<span class="flex flex-wrap items-center gap-2 text-[0.6875rem]">
			{#if message.privateTo}
				<!-- Nobody else reads it until it is made a comment, or the AI's answer changes the spec (ac-evo-live-ask). -->
				<span class="inline-flex items-center gap-1 text-evo-muted"><Icon name="lock" size={11} /> Only you and your AI</span>
				{#if onpublish && opensExchange(message)}
					<button type="button" class="font-semibold text-evo-ink underline decoration-[1.5px] underline-offset-2 disabled:opacity-50" onclick={() => void publish(message.id)}>Make it a comment</button>
				{/if}
			{/if}
			{#if waiting?.id === message.id}
				<!-- The AI asked the reader something here (ac-evo-live-scope). -->
				<span class="font-semibold text-violet-ink" role="status">Lyriks waits for your answer</span>
			{/if}
		</span>
	{/if}
	{#if waiting?.id === message.id && canComment && message.choices?.length}
		<!-- Its answers as buttons: one click sends one, several are ticked then sent (ac-evo-live-choices). -->
		{#if message.multiple}
			<span class="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label="Tick your answers">
				{#each message.choices as choice (choice)}
					{@const on = (ticked[message.id] ?? []).includes(choice)}
					<label class="{CHOICE} inline-flex cursor-pointer items-center gap-1.5 {on ? CHOICE_ON : CHOICE_OFF}">
						<input type="checkbox" class="accent-ink" checked={on} onchange={() => toggleTick(message.id, choice)} />
						{choice}
					</label>
				{/each}
				<button type="button" class="inline-flex min-h-8 items-center gap-1 px-3 text-xs {FILLED}" disabled={(ticked[message.id] ?? []).length === 0} onclick={() => void answerWith(message, ticked[message.id] ?? [])}>
					<Icon name="sparkles" size={12} /> Send
				</button>
			</span>
		{:else}
			<span class="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Your answer">
				{#each message.choices as choice (choice)}
					<button type="button" class="{CHOICE} {CHOICE_OFF}" onclick={() => void answerWith(message, [choice])}>{choice}</button>
				{/each}
			</span>
		{/if}
	{/if}
	{@const asked = ask?.clickOf(message.id) ?? null}
	{#if asked?.state === 'taken'}
		<!-- What the AI does on this ask, said under it, with Cancel (ac-evo-live-click-state). -->
		<span class="self-start"><LiveClickProgress click={asked} label="Lyriks is answering" /></span>
	{:else if message.asking}
		<!-- Sent to the reader's AI a moment ago: it reads as asked while the page reads the thread back (ac-evo-form-edit-optimistic). -->
		<span class="inline-flex items-center gap-1 font-evo-mono text-[0.6875rem] text-violet-ink" role="status">{ASK_STATE.waiting}</span>
	{:else if asked && ASK_STATE[asked.state]}
		<!-- Where an ask of the reader's AI stands (ac-evo-live-click-state). -->
		<span class="inline-flex items-center gap-1 font-evo-mono text-[0.6875rem] text-violet-ink" role="status">{asked.answeredNothing ? 'Lyriks did not answer' : ASK_STATE[asked.state]}</span>
	{/if}
{/snippet}

{#snippet suggestionCard(message: Message, writes: NonNullable<Message['suggests']>)}
	{@const state = suggestionOf(message)}
	<!-- The texts the AI offers, as the place shows them, with Accept and Refuse (ac-evo-live-comment-suggests). -->
	<div class="mt-1.5 flex flex-col gap-2 rounded-lg px-2.5 py-2 {SUGGESTED} {state === 'refused' ? 'opacity-60' : ''}" role="group" aria-label="Suggestion of Lyriks">
		{#each suggestionSections(writes) as section (section.title)}
			<div class="flex flex-col gap-1">
				<span class="flex items-center gap-1.5 text-xs font-bold text-evo-ink"><span class={LLM_BADGE}>AI</span>{section.title}</span>
				{#each section.lines as line, at (at)}
					<span class="flex flex-wrap items-baseline gap-2">
						<!-- The kind in a column of its own, as the lines of 2.1 read. -->
						{#if line.kind}<span class="flex flex-[0_0_96px]"><span class="whitespace-nowrap bg-toner-2 px-2 py-px font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink-2 uppercase">{line.kind}</span></span>{/if}
						<span class="min-w-0 flex-[1_1_240px] text-evo-ink {state === 'refused' ? 'line-through' : ''}">{line.text}</span>
					</span>
				{/each}
			</div>
		{/each}
		<p class="text-xs text-evo-muted">Review each proposed requirement in its category in Solution.</p>
	</div>
{/snippet}

{#snippet sendButtons(openerId: string | null)}
	<!-- Every reply has one send, Reply, which asks the AI in a conversation it takes part in; a new topic offers Comment and 'Ask your AI' (ac-evo-live-one-box). -->
	{@const box = boxOf(openerId)}
	{@const go = (toAi: boolean) => void (openerId ? sendReply(openerId, toAi) : openTopic(toAi))}
	{#if openerId && !box.replyToAi}
		<button type="button" class="pressable min-h-9 rounded-lg border-[1.5px] border-ink bg-evo-ink px-3 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40" onclick={() => go(false)}>Reply</button>
	{:else if box.replyToAi}
		<!-- Without a session of the reader's own it reads greyed: a click copies the prompt and the reply waits (ac-evo-live-no-session). -->
		<button
			type="button"
			class="{SEND} {ask?.refusal
				? 'border-line bg-transparent text-evo-faint'
				: 'pressable border-ink bg-evo-violet text-paper'}"
			title={ask?.refusal ?? 'Lyriks reads it and answers'}
			aria-label={ask?.refusal ? `Reply: ${ask.refusal}` : 'Reply'}
			onclick={() => go(true)}><Icon name="sparkles" size={13} /> Reply</button
		>
	{:else}
		<span class="flex flex-wrap gap-1.5">
			<button type="button" class="pressable min-h-9 rounded-lg border-[1.5px] border-ink bg-evo-ink px-3 text-xs font-bold tracking-[0.07em] text-paper uppercase disabled:opacity-40" onclick={() => go(false)}
				>{ask ? 'Comment' : 'Send'}</button
			>
			{#if ask}
				<!-- Without a session of the reader's own it reads greyed: a click copies the prompt that opens one and the question waits (ac-evo-live-no-session). -->
				<button
					type="button"
					class="{SEND} {ask.refusal
						? 'border-line bg-transparent text-evo-faint'
						: 'border-violet bg-transparent text-violet-ink hover:bg-violet-tint'}"
					title={ask.refusal ?? 'Ask your AI'}
					aria-label={ask.refusal ? `Ask your AI: ${ask.refusal}` : 'Ask your AI'}
							onclick={() => go(true)}><Icon name="sparkles" size={13} /> Ask your AI</button
				>
			{/if}
		</span>
	{/if}
{/snippet}
