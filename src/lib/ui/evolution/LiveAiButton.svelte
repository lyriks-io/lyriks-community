<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { ICON_BTN } from './evo-look';
	import LiveClickProgress from './LiveClickProgress.svelte';
	import { isUnsentClick, useLiveSession, type ClickTarget } from './live-session.svelte';

	/**
	 * Prefill with my AI on a question, Draw with my AI on a diagram
	 * (ac-evo-live-prefill, ac-evo-live-draw). Once clicked it says where the
	 * click stands, waiting, taken by the AI with what it does and Cancel,
	 * answered (ac-evo-live-click-state), and a waiting click can be withdrawn. Without a session of the reader's own
	 * it reads greyed: a click copies the prompt that opens one and waits for it
	 * (ac-evo-live-no-session). Outside a request page it shows nothing. Prefill
	 * is the magic icon alone, its tooltip saying what a click does and where it stands.
	 */
	interface Props {
		kind: 'prefill' | 'draw';
		/** What a click asks about. */
		target: ClickTarget;
		/** Every answer whose clicks this button stands for (a section holds several); the target alone by default. */
		watch?: readonly ClickTarget[];
		disabled?: boolean;
		/** What must happen before the click goes, such as closing the section's editor; false stops it. */
		before?: (() => Promise<boolean>) | null;
		/** The words of the button where the place says them otherwise, such as 'With my AI' on a card left behind. */
		label?: string | null;
		/** One 28 px target in every state, for the strip that follows a long section (ac-evo-form-controls-follow). */
		compact?: boolean;
	}
	let { kind, target, watch = [], disabled = false, before = null, label: named = null, compact = false }: Props = $props();

	const live = useLiveSession();
	/** The latest click on any answer the button stands for: a section says where its click stands, whichever answer it bears on. */
	const click = $derived.by(() => {
		if (!live) return null;
		const clicks = [target, ...watch].map((t) => live.clickOn(t, kind)).filter((c) => c !== null);
		return clicks.sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;
	});
	const refusal = $derived(live?.refusal(kind) ?? null);
	const label = $derived(named ?? (kind === 'prefill' ? 'Prefill with my AI' : 'Draw with my AI'));
	const iconOnly = $derived(kind === 'prefill' && !named);
	/** What the icon says on hover: what a click does, then where its last click stands. */
	const tip = $derived.by(() => {
		const stands =
			click?.state === 'answered' && click.answeredNothing
				? 'Lyriks wrote nothing here: click to ask again.'
				: click?.state === 'answered'
					? 'Prefilled by Lyriks: click to prefill again.'
					: click?.state === 'cancelled'
						? 'Cancelled, what Lyriks wrote is undone: click to prefill again.'
						: null;
		return [`${label}: your AI writes every empty answer of this section at its place, and you validate it.`, stands, refusal].filter(Boolean).join(' ');
	});
	/** The click waits for the AI at once; what must happen first runs before it goes (ac-evo-form-edit-optimistic). */
	function send() {
		if (live) void live.send(kind, target, undefined, before);
	}
</script>

{#if live}
	{#if compact && iconOnly && click?.state === 'waiting'}
		<button
			type="button"
			class="grid size-7 place-items-center rounded-lg bg-violet-tint text-violet-ink"
			title={isUnsentClick(click) ? 'Waiting for your AI' : 'Waiting for your AI · click to withdraw'}
			aria-label={isUnsentClick(click) ? 'Waiting for your AI' : 'Waiting for your AI: withdraw'}
			onclick={() => !isUnsentClick(click) && void live.withdraw(click.id)}
		>
			<Icon name="sparkles" size={14} class="animate-lk-pulse" />
		</button>
	{:else if compact && iconOnly && click?.state === 'taken'}
		<LiveClickProgress {click} compact />
	{:else if iconOnly && click?.state === 'waiting'}
		<span class="inline-flex h-9 items-center gap-0.5 rounded-lg bg-violet-tint pl-2.5 pr-1 text-violet-ink" role="status" title="Waiting for your AI">
			<Icon name="sparkles" size={14} class="animate-lk-pulse" />
			<span class="sr-only">Waiting for your AI</span>
			{#if !isUnsentClick(click)}
				<button type="button" class="flex size-7 items-center justify-center rounded-md hover:bg-paper/60" title="Withdraw: your AI will not take it" aria-label="Withdraw" onclick={() => void live.withdraw(click.id)}>
					<Icon name="x" size={12} />
				</button>
			{/if}
		</span>
	{:else if iconOnly && click?.state !== 'taken'}
		<button
			type="button"
			class="inline-flex {compact ? 'size-7' : 'size-9'} items-center justify-center rounded-lg {ICON_BTN} {refusal ? 'text-evo-faint' : 'text-violet-ink hover:bg-violet-tint'}"
			title={tip}
			aria-label={tip}
			{disabled}
			onclick={send}
		>
			<Icon name={click?.state === 'answered' && !click.answeredNothing ? 'check' : 'sparkles'} size={15} />
		</button>
	{:else if click?.state === 'waiting'}
		<span class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-tint px-2.5 font-evo-mono text-xs text-violet-ink" role="status">
			<Icon name="sparkles" size={13} />
			Waiting for your AI
			{#if !isUnsentClick(click)}<button type="button" class="quiet font-evo text-violet-ink" onclick={() => void live.withdraw(click.id)}>Withdraw</button>{/if}
		</span>
	{:else if click?.state === 'taken'}
		<LiveClickProgress {click} />
	{:else}
		<button
			type="button"
			class="inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-xs font-bold tracking-[0.07em] uppercase {refusal ? 'border-line text-evo-faint' : 'border-violet text-violet-ink hover:bg-violet-tint'}"
			title={refusal ?? label}
			aria-label={refusal ? `${label}: ${refusal}` : label}
			{disabled}
			onclick={send}
		>
			<Icon name={click?.state === 'answered' && !click.answeredNothing ? 'check' : 'sparkles'} size={13} />
			{click?.state === 'answered' && click.answeredNothing
				? 'Nothing written · ask again'
				: click?.state === 'answered'
				? `${kind === 'prefill' ? 'Prefilled' : 'Drawn'} · again`
				: click?.state === 'cancelled'
					? `Cancelled, undone · ${label.toLowerCase()}`
					: label}
		</button>
	{/if}
{/if}
