<script lang="ts">
	import { goto } from '$app/navigation';
	import { Icon, promptDialog } from '$ui/design-system';
	import { personKey, TICKET_FIELD, type ChangeSign } from '$domain/evolution';
	import type { ClosingReading } from '$lib/server/evolution-closing.server';
	import { copyPrompt } from './copy-prompt';
	import { useLiveSession } from './live-session.svelte';
	import { personName } from './people';
	import { relativeWhen } from './relative-when';
	import { ICON_BTN } from './evo-look';

	/**
	 * What a closed evolution leaves behind (the design's closing block): the
	 * message for the ticket it came from, and what it changed in the
	 * Specification 360°, from which version to which. The platform calls no
	 * tracker: the person's own AI posts the message and moves the ticket through
	 * the connector the person gave it, then reports what it did, and only then
	 * does the block say it was posted.
	 */
	interface Props {
		closing: ClosingReading;
		/** The reader may edit the request: telling the ticket speaks for the team. */
		canEdit: boolean;
		actorId: string;
		members: readonly { id: string; name: string }[];
		onDecisionLog: () => void;
	}
	let { closing, canEdit, actorId, members, onDecisionLog }: Props = $props();

	const live = useLiveSession();
	const post = $derived(closing.ticketPost);
	const posted = $derived(!!post?.commented);
	const click = $derived(live?.clickOn({ fieldPath: TICKET_FIELD, leafId: null }, 'ticket') ?? null);
	const inHand = $derived(click?.state === 'waiting' || click?.state === 'taken');
	const key = $derived(closing.ticketKey);
	const head = $derived(posted && post ? `POSTED TO ${post.tool.toUpperCase()} · ${post.ticketKey}` : `MESSAGE FOR THE TICKET${key ? ` · ${key}` : ''}`);
	const poster = $derived(post ? (personKey(post.by) === personKey(actorId) ? 'Lyriks' : `Lyriks for ${personName(post.by, members)}`) : '');
	const status = $derived.by(() => {
		if (!post) return null;
		const when = relativeWhen(post.at);
		if (!post.commented) return { ok: false, text: `Not posted on ${post.ticketKey}: ${post.note} · ${when}` };
		const by = post.byKind === 'ai_client' ? `comment posted by ${poster}` : `comment posted by ${personName(post.by, members)}`;
		return post.movedToDone
			? { ok: true, text: `Ticket moved to Done · ${by} · ${when}` }
			: { ok: false, text: `${by.charAt(0).toUpperCase()}${by.slice(1)}, the ticket did not move to Done${post.note ? `: ${post.note}` : ''} · ${when}` };
	});
	const handTip = $derived(
		key
			? `Have your AI post it on ${key} and move the ticket to Done, through your own tracker connector`
			: 'Have your AI post it on the ticket and move it to Done, through your own tracker connector'
	);

	async function handOff() {
		if (!live) return;
		const ticket =
			key ??
			(await promptDialog({
				title: 'Which ticket?',
				message: 'Nothing the evolution cites names its ticket. Lyriks posts the message on the one you name.',
				placeholder: 'The ticket’s key, e.g. PROJ-123',
				confirmLabel: 'Send to my AI'
			}))?.trim();
		if (ticket) await live.sendTicket(ticket, closing.message, canEdit);
	}

	// The sign of a change in the design's marks: added green, changed orange, removed red-ink.
	const SIGN_LOOK: Readonly<Record<ChangeSign, string>> = {
		'+': 'bg-green text-ink',
		'~': 'bg-orange text-ink',
		'-': 'bg-red-ink text-paper'
	};
	const SHOWN = 8;
	let all = $state(false);
	const rows = $derived(all ? closing.changes : closing.changes.slice(0, SHOWN));
	const CARD = 'flex min-w-0 flex-[1_1_320px] flex-col gap-2.5 rounded-evo-card border border-transparent bg-surface p-[18px]';
	/** The design's two buttons of the block, smaller than a step's: 38px, the pressable button with its bold uppercase label. */
	const BUTTON = 'pressable inline-flex min-h-[38px] items-center rounded-evo-btn border-[1.5px] border-ink px-3.5 text-xs font-bold tracking-[0.07em] uppercase';
</script>

<div class="animate-lk-in flex flex-wrap items-stretch gap-3.5" aria-label="Evolution closed">
	<section class={CARD} aria-label="Message for the ticket">
		<span class="flex items-center gap-2">
			<span aria-hidden="true" class="flex size-6 flex-none items-center justify-center rounded-md bg-blue-ink font-evo-mono text-xs font-bold text-paper">
				{#if posted && post}{post.tool.charAt(0).toUpperCase()}{:else}<Icon name="message-circle" size={13} />{/if}
			</span>
			<span class="min-w-0 font-evo-mono text-xs tracking-[0.08em] text-blue-ink wrap-anywhere">{head}</span>
		</span>
		<div class="bg-evo-sunken px-3.5 py-3 text-[0.8125rem] leading-[1.6] whitespace-pre-wrap text-evo-ink wrap-anywhere">{closing.message}</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if status}
				<span class="mr-auto font-evo-mono text-xs font-bold {status.ok ? 'text-green-ink' : 'text-orange-ink'}">{status.ok ? '✓ ' : ''}{status.text}</span>
			{:else if click?.state === 'taken'}
				<span class="mr-auto inline-flex items-center gap-1.5 font-evo-mono text-xs font-bold text-violet-ink" role="status"><Icon name="sparkles" size={12} class="animate-lk-pulse" />Lyriks is posting it</span>
			{:else if click?.state === 'waiting'}
				<span class="mr-auto inline-flex items-center gap-1.5 font-evo-mono text-xs font-bold text-violet-ink" role="status">
					<Icon name="sparkles" size={12} class="animate-lk-pulse" />Waiting for your AI
					<button type="button" class="quiet text-ink" onclick={() => live && void live.withdraw(click.id)}>Withdraw</button>
				</span>
			{:else}
				<span class="mr-auto font-evo-mono text-xs text-ink-3">To post on the ticket{key ? '' : ' it came from'}.</span>
			{/if}
			<button
				type="button"
				class="inline-flex size-9 items-center justify-center rounded-lg {ICON_BTN} text-ink"
				title="Copy the message"
				aria-label="Copy the message"
				onclick={() => copyPrompt(closing.message, 'Message copied: paste it on the ticket.')}
			>
				<Icon name="copy" size={15} />
			</button>
			{#if live && canEdit && !posted && !inHand}
				<button type="button" class="inline-flex size-9 items-center justify-center rounded-lg {ICON_BTN} text-violet-ink" title={handTip} aria-label={handTip} onclick={handOff}>
					<Icon name="sparkles" size={15} />
				</button>
			{/if}
		</div>
	</section>

	<section class={CARD} aria-label="Knowledge changes">
		<span class="flex items-center gap-1.5 font-evo-mono text-xs tracking-[0.08em] text-blue-ink">
			KNOWLEDGE{closing.version ? ` · ${closing.version.from} → ${closing.version.to}` : ''}
			{#if !closing.version}
				<span class="text-evo-muted" title="The specification was never validated: its changes carry no version yet." aria-label="No version: the specification was never validated"><Icon name="info" size={12} /></span>
			{/if}
		</span>
		{#if closing.changes.length === 0}
			<span class="text-[0.8125rem] text-ink-3 italic">This evolution changed nothing in the specification.</span>
		{:else}
			<ul class="m-0 flex list-none flex-col gap-1.5 p-0">
				{#each rows as change, i (i)}
					<li class="flex items-center gap-2 text-[0.8125rem] leading-[1.45]">
						<span class="flex size-5 flex-none items-center justify-center rounded-md font-evo-mono font-bold {SIGN_LOOK[change.sign]}" aria-label={change.sign === '+' ? 'Added' : change.sign === '~' ? 'Changed' : 'Removed'}>{change.sign}</span>
						<span class="w-[76px] flex-none font-evo-mono text-xs text-ink-3">{change.kind}</span>
						<span class="min-w-0 wrap-anywhere">{change.label}</span>
					</li>
				{/each}
			</ul>
			{#if closing.changes.length > SHOWN}
				<button type="button" class="self-start text-[0.8125rem] font-semibold text-blue-ink hover:underline" onclick={() => (all = !all)}>
					{all ? 'Show less' : `Show all ${closing.changes.length}`}
				</button>
			{/if}
		{/if}
		<div class="mt-auto flex flex-wrap gap-2">
			<button type="button" class="{BUTTON} bg-evo-violet text-paper" onclick={() => goto(closing.specHref)}>Open Knowledge</button>
			<button type="button" class="{BUTTON} bg-transparent text-ink" onclick={onDecisionLog}>Decision log</button>
		</div>
	</section>
</div>
