<script lang="ts">
	import { Button, Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import { REQUEST_ORIGINS, type RequestStage } from '$domain/evolution';
	import type { RequestCardView } from '$lib/server/evolution-view.server';

	/**
	 * The board in the three-step reading: where each request stands (idea and
	 * proposals, impact report, then verify and accept once code exists) and the
	 * one thing waiting on it, read without opening anything.
	 */
	interface Props {
		cards: readonly RequestCardView[];
		canEdit: boolean;
		onOpen: (id: string) => void;
		onNew: () => void;
	}
	let { cards, canEdit, onOpen, onNew }: Props = $props();

	let query = $state('');

	const COLUMNS: readonly { key: string; title: string; stages: readonly RequestStage[]; hint: string }[] = [
		{ key: 'idea', title: 'Idea and proposals', stages: ['draft', 'specification'], hint: 'Say the change, sign the values.' },
		{ key: 'impact', title: 'Impact report', stages: ['coherence'], hint: 'What moves in the spec and in the code.' },
		{ key: 'verify', title: 'Verify', stages: ['implementation'], hint: 'The code against the frozen spec.' },
		{ key: 'accept', title: 'Accept', stages: ['acceptance'], hint: 'Walk the product, fold the remarks back.' },
		{ key: 'delivered', title: 'Delivered', stages: ['delivered'], hint: 'Out, and closed once nothing is owed.' }
	];

	const visible = $derived(cards.filter((c) => matchesQuery(query, c.title)));
	const inColumn = (stages: readonly RequestStage[]) => visible.filter((c) => stages.includes(c.shownStage));

	const originLabel = (code: RequestCardView['origin']) =>
		REQUEST_ORIGINS.find((o) => o.code === code)?.label ?? 'Origin not set';

	/** The one thing waiting on a request, in the reader's words. */
	function waiting(card: RequestCardView): string {
		if (card.title.trim() === '') return 'Needs a title';
		if (card.blockingFindings > 0) return `${card.blockingFindings} blocking ${card.blockingFindings === 1 ? 'finding' : 'findings'}`;
		if (card.pendingProposals > 0) return `${card.pendingProposals} ${card.pendingProposals === 1 ? 'proposal' : 'proposals'} to sign`;
		if (card.undecidedLines > 0) return `${card.undecidedLines} report ${card.undecidedLines === 1 ? 'line' : 'lines'} to decide`;
		if (card.acceptanceDebt > 0) return `${card.acceptanceDebt} ${card.acceptanceDebt === 1 ? 'remark' : 'remarks'} to fold back`;
		if (card.criticalEmpty > 0) return `${card.criticalEmpty} critical ${card.criticalEmpty === 1 ? 'field' : 'fields'} empty`;
		if (card.leafIds.length === 0) return 'Name the features it touches';
		return 'Nothing waiting';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<SearchInput bind:value={query} placeholder="Find a request" class="w-full max-w-xs" />
		{#if canEdit}
			<Button onclick={onNew}>
				<Icon name="plus" size={14} />
				New evolution
			</Button>
		{/if}
	</div>

	{#if cards.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
			<p class="text-sm font-medium text-ink-900">No evolution yet.</p>
			<p class="mt-1 text-xs text-ink-400">
				Say the change in one line, name the features it touches, and read what it would move.
			</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
			{#each COLUMNS as column (column.key)}
				{@const items = inColumn(column.stages)}
				<section class="min-w-0 rounded-card border border-line bg-surface-sunken/60 p-3" aria-label={column.title}>
					<header class="mb-2 px-1">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-ink-700">
							{column.title}
							<span class="ml-1 font-normal text-ink-400">{items.length}</span>
						</h2>
						<p class="text-[11px] text-ink-400">{column.hint}</p>
					</header>
					<div class="space-y-2">
						{#each items as card (card.id)}
							<button
								type="button"
								class="w-full rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-brand-400"
								onclick={() => onOpen(card.id)}
							>
								<p class="text-sm font-semibold text-ink-900">{card.title || 'Untitled request'}</p>
								<p class="mt-0.5 text-[11px] text-ink-400">{originLabel(card.origin)}</p>
								<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-700">
									<Icon name={card.blockingFindings > 0 ? 'circle-alert' : 'arrow-right'} size={12} class={card.blockingFindings > 0 ? 'text-warning-600' : 'text-brand-600'} />
									{waiting(card)}
								</p>
								{#if card.waived}
									<p class="mt-1 flex items-center gap-1 text-[11px] text-accent-700">
										<Icon name="flag" size={11} />
										Crossed on a waiver
									</p>
								{/if}
								{#if card.specVersion > 0}
									<p class="mt-1 text-[11px] text-ink-400">Spec frozen as version {card.specVersion}</p>
								{/if}
							</button>
						{:else}
							<p class="px-1 py-3 text-xs text-ink-400">Nothing here.</p>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
