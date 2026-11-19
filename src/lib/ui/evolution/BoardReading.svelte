<script lang="ts">
	import { page } from '$app/state';
	import type { BoardCardView, SuggestionCardView } from '$lib/server/evolution-view.server';
	import type { AppChrome } from '$lib/shared/app-chrome';
	import { evolutionStanding, personKey, type EvolutionStanding } from '$domain/evolution';
	import { Icon, ScoreCount, portalWhile } from '$ui/design-system';
	import { personName } from './people';
	import { PRIMARY_44, SECONDARY_44, TAG, TAG_TONE } from './evo-look';

	/**
	 * The Evolutions page of the design: the requests as one list, narrowed by
	 * where they stand: in progress, completed (live), or canceled (closed before
	 * going live). In progress first, then completed, then canceled, the newest
	 * first in each; each row reads its key like a ticket number, its title and
	 * where it stands, and a pulsing dot while an AI is in session on it. A
	 * project with no evolution at all says where every change now starts; one
	 * whose specification holds no feature offers no New evolution and says where
	 * the product is described first (criterion 40bef6da). Rows in progress are
	 * ticked, without opening them, to read their concurrent impact (criterion b282eb26).
	 * The roadmap, the page's other view, is a link beside New change for every
	 * reader (criterion ff115da8).
	 */
	interface Props {
		cards: readonly BoardCardView[];
		/** The omissions deferred to a future evolution, read off the choice on their line (criterion 35991202). */
		suggestions?: readonly SuggestionCardView[];
		canEdit: boolean;
		productName: string;
		/** The reader, and the people whose AI may be in session, to say whose. */
		actorId: string;
		members: readonly { id: string; name: string }[];
		/** The specification holds a product to change: without one, no evolution starts. */
		hasProduct: boolean;
		/** Where the product is described first, while it has no specification. */
		specHref: string;
		retroHref: string;
		onOpen: (id: string) => void;
		/** Opens the concurrent impact of the evolutions picked. */
		onConcurrent: (ids: readonly string[]) => void;
		onNew: () => void;
		/** Opens the line a suggestion comes from. */
		onOpenLine?: (href: string) => void;
		/** Turns a suggestion into an evolution (criterion 03b7eacf). */
		onStart?: (lineId: string) => void;
		/** Where the roadmap opens; without one, no link to it shows. */
		roadmapHref?: string;
	}
	let { cards, suggestions = [], canEdit, productName, actorId, members, hasProduct, specHref, retroHref, onOpen, onConcurrent, onNew, onOpenLine = () => {}, onStart = () => {}, roadmapHref }: Props = $props();

	/** "Your AI is in session on it", or whose: the AIs at work on a request right now. */
	function sessionWords(card: BoardCardView): string | null {
		const who = card.inSession ?? [];
		if (who.length === 0) return null;
		const names = who.map((id) => (personKey(id) === personKey(actorId) ? 'Your AI' : `${personName(id, members)}'s AI`));
		return `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} in session on it`;
	}

	type Standing = EvolutionStanding;
	// The count beside Changes in the navigation reads the same standing (criterion b2f17eef).
	const standingOf = (card: BoardCardView): Standing => evolutionStanding(card);
	// The design's tags (.ly-tag): in progress outlined in the action blue, completed filled green, canceled a toner-2 chip.
	const STANDING: Record<Standing, { label: string; look: string }> = {
		open: { label: 'In progress', look: `${TAG} ${TAG_TONE.blue}` },
		deployed: { label: 'Completed', look: `${TAG} ${TAG_TONE.valid}` },
		canceled: { label: 'Canceled', look: `${TAG} border-toner-2 bg-toner-2 text-ink-2` }
	};
	let standing = $state<Standing | 'all' | 'suggested'>('all');
	const standingFilter = (s: Standing) => ({ id: s, label: `${STANDING[s].label} · ${cards.filter((c) => standingOf(c) === s).length}` });
	const filters = $derived([
		{ id: 'all' as const, label: `All · ${cards.length + suggestions.length}` },
		standingFilter('open'),
		...(suggestions.length > 0 ? [{ id: 'suggested' as const, label: `Suggested · ${suggestions.length}` }] : []),
		standingFilter('deployed'),
		standingFilter('canceled')
	]);
	const STANDING_ORDER: readonly Standing[] = ['open', 'deployed', 'canceled'];
	/** With fewer than two in progress there is nothing to read together, so no square shows (criterion b282eb26). */
	const canPick = $derived(cards.filter((c) => standingOf(c) === 'open').length >= 2);
	let picked = $state<ReadonlySet<string>>(new Set());
	const pickedIds = $derived(cards.filter((c) => picked.has(c.id) && standingOf(c) === 'open').map((c) => c.id));
	function togglePick(id: string) {
		const next = new Set(picked);
		if (!next.delete(id)) next.add(id);
		picked = next;
	}
	/** The app bar already read whether the Specification 360° is validated, which the empty list says. */
	const specValidated = $derived((page.data.chrome as AppChrome | undefined)?.tabs?.specBadge === 'validated');
	const visible = $derived(
		cards
			.map((card, at) => ({ card, at }))
			.sort((a, b) => STANDING_ORDER.indexOf(standingOf(a.card)) - STANDING_ORDER.indexOf(standingOf(b.card)) || b.at - a.at)
			.map((x) => x.card)
			.filter((c) => standing === 'all' || standingOf(c) === standing)
	);
	type Row = { readonly kind: 'card'; readonly card: BoardCardView } | { readonly kind: 'suggestion'; readonly suggestion: SuggestionCardView };
	/** The suggestions read right after the requests in progress (criterion 35991202). */
	const rows = $derived.by<Row[]>(() => {
		const requests = visible.map((card): Row => ({ kind: 'card', card }));
		const suggested = standing === 'all' || standing === 'suggested' ? suggestions.map((suggestion): Row => ({ kind: 'suggestion', suggestion })) : [];
		const inProgress = visible.filter((c) => standingOf(c) === 'open').length;
		return [...requests.slice(0, inProgress), ...suggested, ...requests.slice(inProgress)];
	});
</script>

<div class="evo-motion animate-lk-in flex flex-col gap-5 font-evo text-[0.9375rem] leading-normal text-evo-ink">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<h1 class="m-0 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em]">Changes</h1>
		<div class="flex flex-wrap items-center gap-2.5">
			{#if roadmapHref}
				<!-- The page's other view, whatever the reader's role; its tabs lead back here (criterion ff115da8). -->
				<a href={roadmapHref} class="{SECONDARY_44} no-underline" data-sveltekit-noscroll>Roadmap</a>
			{/if}
			{#if canEdit && hasProduct}
				<button type="button" class={PRIMARY_44} onclick={onNew}>New change</button>
			{/if}
		</div>
	</div>
	<div role="group" aria-label="Filter evolutions" class="flex flex-wrap gap-1 self-start rounded-2xl border border-transparent bg-surface p-1.5">
		{#each filters as filter (filter.id)}
			{@const on = standing === filter.id}
			<button
				type="button"
				class="min-h-10 rounded-evo-btn px-3.5 font-evo-mono text-xs font-bold tracking-[0.06em] {on ? 'bg-ink text-paper' : 'bg-transparent text-ink-2 hover:bg-toner-1'}"
				aria-pressed={on}
				onclick={() => (standing = filter.id)}>{filter.label}</button
			>
		{/each}
	</div>
	<div class="overflow-hidden rounded-evo-card border border-transparent bg-surface">
		{#each rows as row (row.kind === 'card' ? row.card.id : `suggestion-${row.suggestion.lineId}`)}
			{#if row.kind === 'suggestion'}
				{@const suggestion = row.suggestion}
				<div class="flex min-h-[68px] flex-wrap items-center gap-4 border-b border-line bg-surface py-3.5 pr-5 last:border-b-0 {canPick ? 'pl-[52px]' : 'pl-5'}">
					<span class="w-[72px] font-evo-mono text-xs text-ink-3">↳ {suggestion.fromKey}</span>
					<button type="button" class="flex min-w-0 flex-[1_1_260px] cursor-pointer flex-col gap-0.5 border-0 bg-transparent p-0 text-left text-evo-ink hover:underline" onclick={() => onOpenLine(suggestion.href)}>
						<span class="text-[0.9375rem] leading-[1.3] font-bold">{suggestion.title}</span>
						<span class="text-xs text-ink-3">Deferred from {suggestion.fromKey}</span>
					</button>
					<span class="px-2.5 py-1 text-xs {TAG} border-dashed border-ink-3 text-ink-2">Suggested</span>
					{#if canEdit}
						<button type="button" class="{SECONDARY_44} min-h-9" onclick={() => onStart(suggestion.lineId)}>Start this evolution</button>
					{/if}
				</div>
			{:else}
			{@const card = row.card}
			{@const look = STANDING[standingOf(card)]}
			{@const isPicked = picked.has(card.id)}
			<div class="relative border-b border-line last:border-b-0">
			{#if canPick && standingOf(card) === 'open'}
				<!-- Ticked without opening the evolution, to read it against others (criterion b282eb26). -->
				<button
					type="button"
					class="absolute top-1/2 left-5 z-[1] grid size-[18px] -translate-y-1/2 cursor-pointer place-items-center border-[1.5px] p-0 {isPicked ? 'border-blue-ink bg-blue-ink text-paper' : 'border-ink-3 bg-paper text-transparent hover:border-ink'}"
					role="checkbox"
					aria-checked={isPicked}
					aria-label="Pick {card.key} for the concurrent impact"
					title="Pick this evolution to read it against others"
					onclick={() => togglePick(card.id)}><Icon name="check" size={12} /></button
				>
			{/if}
			<button type="button" class="flex min-h-[68px] w-full flex-wrap items-center gap-4 py-3.5 pr-5 text-left hover:bg-toner-1 {canPick ? 'pl-[52px]' : 'pl-5'} {isPicked ? 'bg-blue-tint/60' : 'bg-surface'}" onclick={() => onOpen(card.id)}>
				<span class="w-[72px] font-evo-mono text-xs text-ink-3">{card.key}</span>
				<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] leading-[1.3] font-bold">{card.title || 'Untitled request'}</span>
				{#if sessionWords(card)}
					<span class="relative flex size-2.5 flex-none" title={sessionWords(card)} role="img" aria-label={sessionWords(card)}>
						<span class="absolute inset-0 animate-lk-pulse bg-green"></span>
					</span>
				{/if}
				<span class="px-2.5 py-1 text-xs {look.look}">{look.label}</span>
			</button>
			</div>
			{/if}
		{:else}
			{#if cards.length === 0 && !hasProduct}
				<div class="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
					<span class="text-xl font-bold tracking-[-0.02em] text-evo-ink">No product to change yet</span>
					<span class="max-w-[460px] text-sm leading-normal text-ink-2"
						>An evolution changes a product its specification describes, and this project's specification holds no feature yet. Describe the product first: in Knowledge, by hand or with your AI, or rebuild an existing product's specification from its code or documents.</span
					>
					<span class="mt-3 flex flex-wrap justify-center gap-2">
						<a href={specHref} class="{PRIMARY_44} no-underline hover:text-white">Open Knowledge</a>
						<a href={retroHref} class="{SECONDARY_44} no-underline hover:text-evo-ink">From existing code</a>
					</span>
				</div>
			{:else if cards.length === 0}
				<div class="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
					<span class="text-xl font-bold tracking-[-0.02em] text-evo-ink">No evolution yet</span>
					<span class="max-w-[420px] text-sm leading-normal text-ink-2"
						>{specValidated
							? 'The specification is validated: every change to the product can now start here, as an evolution.'
							: 'Every change to the product starts here, as an evolution.'}</span
					>
					{#if canEdit}
						<button type="button" class="{PRIMARY_44} mt-3" onclick={onNew}>+ New change</button>
					{/if}
				</div>
			{:else}
				<p class="px-5 py-8 text-center text-[0.8125rem] text-ink-3 italic">No evolution here.</p>
			{/if}
		{/each}
	</div>
</div>

{#if pickedIds.length > 0}
	<!-- Portalled under body: the page fades in with a transform, which would hold a fixed bar at the foot of the list. -->
	<div class="contents" use:portalWhile={true}>
		<div
			role="region"
			aria-label="Evolutions picked for the concurrent impact"
			class="animate-lk-in-fast fixed bottom-[calc(20px+var(--app-foot-h,0px)+env(safe-area-inset-bottom,0px))] left-[calc(50%+var(--side-w,0px)/2)] z-[80] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 border-2 border-ink bg-paper py-2.5 pr-3 pl-4 font-evo text-[0.8125rem] text-ink shadow-[4px_4px_0_var(--color-blue)]"
		>
			<b class="inline-flex items-center gap-2 font-evo-mono font-bold"><ScoreCount value={pickedIds.length} from={0} reserve={2} class="text-[1.375rem]" /><span class="min-w-[9ch]">picked</span></b>
			<button type="button" class="{PRIMARY_44} min-h-9" title={pickedIds.length === 1 ? 'Read it against every other evolution in progress' : 'Read them against each other'} onclick={() => onConcurrent(pickedIds)}>Read the concurrent impact</button>
			<button type="button" class="min-h-8 cursor-pointer border-0 bg-transparent font-evo text-[0.6875rem] font-bold tracking-[0.07em] text-ink-3 uppercase hover:text-ink" onclick={() => (picked = new Set())}>Clear</button>
		</div>
	</div>
{/if}
