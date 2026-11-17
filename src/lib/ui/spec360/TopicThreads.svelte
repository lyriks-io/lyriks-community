<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { relativeWhen } from '$ui/evolution/relative-when';
	import type { DiscussionMessage, DiscussionThread } from '$domain/discussions';
	import { useDiscussions } from './discussions.svelte';
	import { avatarColor } from './person-look';
	import { initials } from '$ui/team/team-style';
	import { landOn } from '$ui/shell/landing-mark';
	import { FIELD, MORE, POP, PRESS_FILL, PRESS_LINE } from './page/look';

	/**
	 * The discussions held on one element, opened under it, read as topics like
	 * the Evolution pages: each topic with who opened it, their job, when and
	 * where it stands, its replies under it, then Reply and Resolve (or Reopen).
	 * The resolved ones fold behind one link; a new topic is written at the
	 * foot, behind Add a comment once there is a topic (criterion 6ef1230e), a
	 * typed @ naming the colleague it notifies. Enter sends, Shift+Enter starts
	 * a new line. A topic stays among people: the AI is questioned in Ask my AI
	 * alone, whose messages worth deciding are published here (criterion
	 * f7249f99); a topic the AI answered in before reads as it was.
	 */
	interface Props {
		anchor: string;
		/** What the element is called, kept on a new thread for its notifications. */
		title: string;
	}
	let { anchor, title }: Props = $props();
	const discussions = useDiscussions();
	const threads = $derived(discussions.threads(anchor));
	const open = $derived(threads.filter((t) => t.state !== 'resolved'));
	const resolved = $derived(threads.filter((t) => t.state === 'resolved'));
	let showResolved = $state(false);
	const shown = $derived(showResolved ? [...open, ...resolved] : open);
	const mention = $derived(discussions.mentionCandidates(anchor));

	/** Add a comment was clicked: the box to start a topic shows under the topics (criterion 6ef1230e). */
	let composing = $state(false);
	const topicBoxShown = $derived(threads.length === 0 || composing);
	let topicBox: HTMLTextAreaElement | undefined = $state();
	async function addComment() {
		composing = true;
		await tick();
		topicBox?.focus();
	}
	/**
	 * A link to one of these conversations (criterion 0bdc1d4f): a resolved one unfolds, then the message it names
	 * (else the conversation) is brought to the middle of the window and marked. Once: a later post, an answer
	 * arriving or a reload leaves the reader where they are.
	 */
	let root: HTMLDivElement | undefined = $state();
	$effect(() => {
		const landing = discussions.landing;
		const thread = landing ? threads.find((t) => t.id === landing.threadId) : undefined;
		if (!landing || !thread) return;
		untrack(() => {
			discussions.landing = null;
			if (thread.state === 'resolved') showResolved = true;
			void tick().then(() =>
				requestAnimationFrame(() => {
					const card = root?.querySelector<HTMLElement>(`[data-thread="${CSS.escape(thread.id)}"]`);
					const message = landing.messageId ? card?.querySelector<HTMLElement>(`[data-message="${CSS.escape(landing.messageId)}"]`) : null;
					landOn(message ?? card);
				})
			);
		});
	});

	async function openTopic() {
		if (await discussions.post(anchor, title)) composing = false;
	}
	/**
	 * Cancel, or Escape: the box folds back to the link, what was typed dropped, nothing posted (criterion 6ef1230e).
	 * With no topic yet there is no link to fold back to, so the element's comments close (action 062e6917).
	 */
	const closesComments = $derived(threads.length === 0 && discussions.openAnchor === anchor);
	const cancellable = $derived(composing || closesComments);
	function cancelComment() {
		discussions.drafts[anchor] = '';
		discussions.picked[anchor] = [];
		composing = false;
		if (closesComments) discussions.toggle(anchor);
	}

	/** Their job, when, and for the topic's opener where it stands: "· Tech Lead · 2 h ago · Open". */
	function byline(m: DiscussionMessage, thread: DiscussionThread | null): string {
		const status = thread ? (thread.state === 'resolved' ? 'Resolved' : 'Open') : '';
		return `· ${[discussions.jobOf(m.author.email), relativeWhen(m.at), status].filter(Boolean).join(' · ')}`;
	}

	function toggleReply(thread: DiscussionThread) {
		discussions.replyingTo = discussions.replyingTo === thread.id ? null : thread.id;
		discussions.replyDraft = '';
	}

	/** Enter sends, Shift+Enter starts a new line. */
	function onEnter(event: KeyboardEvent, send: () => void) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			send();
		}
	}

	// The design's secondary button (.ly-btn) at the thread's own size.
	const OUTLINE = `${PRESS_LINE} min-h-9 px-2.5 text-xs`;
	const BOX = `box-border min-h-9 resize-y ${FIELD} px-2.5 py-2 font-[inherit] text-[0.8125rem]`;
</script>

<div bind:this={root} class="animate-lk-in flex flex-col gap-2 pt-1" data-comments>
	{#if open.length === 0}
		<span class="text-[0.8125rem] text-evo-muted">No open topics.</span>
	{/if}
	{#each shown as thread (thread.id)}
		{@const [opener, ...replies] = thread.messages}
		{@const isResolved = thread.state === 'resolved'}
		<div class="flex flex-wrap items-start gap-2.5 rounded-lg border bg-evo-sunken px-2.5 py-2 {isResolved ? 'border-line opacity-70' : 'border-orange'}" data-thread={thread.id}>
			<span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5 text-[0.8125rem] leading-normal">
				<span class="flex flex-col gap-0.5" data-message={opener.id}>
					<span><b>{opener.author.name}</b> <span class="text-evo-muted">{byline(opener, thread)}</span></span>
					<span class="whitespace-pre-line [overflow-wrap:anywhere] {isResolved ? 'text-evo-muted' : 'text-evo-ink'}">{opener.text}</span>
				</span>
				{#each replies as reply (reply.id)}
					<span class="mt-2 flex flex-col gap-px pt-2" data-message={reply.id}>
						<span><b>{reply.author.name}</b> <span class="text-evo-muted">{byline(reply, null)}</span></span>
						<span class="whitespace-pre-line [overflow-wrap:anywhere]">{reply.text}</span>
					</span>
				{/each}
			</span>
			<span class="flex flex-wrap gap-1">
				{#if !isResolved}
					<button type="button" class={OUTLINE} aria-expanded={discussions.replyingTo === thread.id} onclick={() => toggleReply(thread)}
						>{replies.length > 0 ? `Reply (${replies.length})` : 'Reply'}</button
					>
					<button type="button" class={OUTLINE} onclick={() => discussions.rule(thread)}>Resolve</button>
				{:else}
					<button type="button" class={OUTLINE} onclick={() => discussions.rule(thread)}>Reopen</button>
				{/if}
			</span>
			{#if discussions.replyingTo === thread.id}
				<div class="animate-lk-in flex basis-full flex-wrap items-start gap-2">
					<textarea
						rows="1"
						aria-label="Reply"
						placeholder="Your reply… (Enter to send)"
						bind:value={discussions.replyDraft}
						onkeydown={(e) => (e.key === 'Escape' ? (discussions.replyingTo = null) : onEnter(e, () => discussions.reply(thread)))}
						class="{BOX} flex-[1_1_280px]"
					></textarea>
					<button type="button" onclick={() => discussions.reply(thread)} class="{PRESS_FILL} min-h-9 px-3 text-xs">Reply</button>
				</div>
			{/if}
		</div>
	{/each}
	{#if resolved.length > 0}
		<button type="button" class="min-h-8 cursor-pointer self-start border-0 bg-transparent p-0 {MORE} hover:underline" onclick={() => (showResolved = !showResolved)}>
			{showResolved ? 'Hide resolved comments' : `Show ${resolved.length} comment(s) resolved`}
		</button>
	{/if}
	{#if topicBoxShown}
		<div class="flex flex-wrap items-start gap-2">
			<textarea
				bind:this={topicBox}
				rows="1"
				aria-label="Open a new topic"
				placeholder="Open a new topic… (Enter to send, Shift+Enter for a new line)"
				bind:value={discussions.drafts[anchor]}
				onkeydown={(e) => (e.key === 'Escape' && cancellable ? cancelComment() : onEnter(e, openTopic))}
				class="{BOX} flex-[1_1_320px]"
			></textarea>
			<button type="button" class={OUTLINE} onclick={openTopic}>New topic</button>
			{#if cancellable}
				<button type="button" class="min-h-9 cursor-pointer border-0 bg-transparent px-1 text-xs {MORE} hover:underline" onclick={cancelComment}>Cancel</button>
			{/if}
		</div>
	{:else}
		<!-- A topic is there: the box to start another waits behind one link (criterion 6ef1230e). -->
		<button type="button" class="min-h-8 cursor-pointer self-start border-0 bg-transparent p-0 {MORE} hover:underline" onclick={addComment}>Add a comment</button>
	{/if}
	{#if mention}
		<div class="animate-lk-in-fast mt-1 flex flex-col gap-0.5 {POP} p-1">
			<span class="px-2 py-1 font-evo-mono text-xs tracking-[0.08em] text-evo-muted">MENTION SOMEONE</span>
			{#each mention.people as person (person.email)}
				<button
					type="button"
					onclick={() => discussions.pickMention(anchor, person)}
					class="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1 text-left text-sm text-evo-ink hover:bg-toner-1"
				>
					<span aria-hidden="true" class="flex size-6 flex-none items-center justify-center font-evo-mono text-[0.625rem] font-bold text-white" style:background={avatarColor(person.email)}>{initials(person.name)}</span>
					<span class="font-semibold">{person.name}</span>
					{#if person.job}<span class="text-xs text-evo-muted">{person.job}</span>{/if}
				</button>
			{/each}
			{#if mention.people.length === 0}
				<span class="px-2 py-1.5 text-[0.8125rem] text-evo-muted">No team member matches</span>
			{/if}
		</div>
	{/if}
</div>
