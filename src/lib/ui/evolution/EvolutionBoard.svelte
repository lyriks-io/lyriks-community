<script lang="ts">
	import { Button, Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		BOARD_COLUMNS,
		REQUEST_ORIGINS,
		REQUEST_STAGES,
		type EvolutionRequest,
		type ImpactSeverity,
		type RequestStage
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * One column per stage plus Delivered, so what needs attention today can be
	 * read without opening anything.
	 *
	 * A card is never placed by hand. Its column is read from the request, so it
	 * sits where its own state has got it to, and the only things that move it
	 * are the four gates and the named waiver that crosses one that is not met.
	 * Dragging read as a decision without being one: it recorded a crossing no
	 * gate had opened, and nothing took it back.
	 */
	interface Props {
		store: EvolutionStore;
		onOpen: (id: string) => void;
	}
	let { store, onOpen }: Props = $props();

	let query = $state('');

	const stageLabel = (stage: RequestStage) =>
		REQUEST_STAGES.find((s) => s.code === stage)?.label ?? stage;
	const originLabel = (request: EvolutionRequest) =>
		REQUEST_ORIGINS.find((o) => o.code === request.origin)?.label ?? 'No origin';

	const SEVERITY_TONE: Record<ImpactSeverity, string> = {
		none: 'bg-surface-sunken text-ink-500',
		low: 'bg-info-50 text-info-600',
		medium: 'bg-warning-50 text-warning-600',
		high: 'bg-accent-50 text-accent-600',
		blocking: 'bg-danger-50 text-danger-700'
	};

	const visible = (stage: RequestStage) =>
		store
			.requestsInStage(stage)
			.filter((r) => matchesQuery(query, r.title, originLabel(r), r.requester, ...r.leafIds));

	const total = $derived(store.live.filter((r) => store.stageOf(r) !== 'draft').length);
	const shown = $derived(BOARD_COLUMNS.reduce((n, stage) => n + visible(stage).length, 0));

</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<p class="text-sm font-semibold text-ink-900">Evolution board</p>
			<p class="text-[11px] text-ink-500">
				One column per stage plus Delivered. A card shows its maturity, the coherence delta and the
				worst impact severity, so a blocker is visible without opening it.
			</p>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2">
			<SearchInput
				bind:value={query}
				placeholder="Search a request, origin or requester…"
				class="w-full max-w-xs"
				resultLabel="{shown} of {total} requests"
			/>
			<Button size="sm" onclick={() => onOpen(store.startDraft())}>
				<Icon name="plus" size={13} /> New request
			</Button>
		</div>
	</div>

	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
		{#each BOARD_COLUMNS as stage (stage)}
			{@const cards = visible(stage)}
			<section
				role="list"
				aria-label={stageLabel(stage)}
				class="flex min-h-40 flex-col rounded-card border border-line bg-surface-sunken/40 p-2"
			>
				<header class="mb-2 flex items-center gap-2 px-1">
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{stageLabel(stage)}
					</span>
					<span class="rounded-pill bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
						{cards.length}
					</span>
				</header>

				<div class="space-y-2">
					{#each cards as request (request.id)}
						{@const card = store.cardOf(request)}
						<article
							role="listitem"
							class="rounded-field border border-line bg-surface p-2.5 transition hover:border-line-strong"
						>
							<button
								type="button"
								onclick={() => onOpen(request.id)}
								class="w-full text-left"
							>
								<p class="truncate text-[13px] font-semibold text-ink-900">
									{request.title || 'Untitled request'}
								</p>
								<p class="mt-0.5 truncate text-[10px] text-ink-400">{originLabel(request)}</p>
							</button>

							<div class="mt-2 flex flex-wrap items-center gap-1">
								<span
									class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold text-ink-600"
									title="Specification maturity"
								>
									{card.maturity}%
								</span>
								{#if card.coherenceDelta !== 0}
									<span
										class="rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {card.coherenceDelta < 0
											? 'bg-danger-50 text-danger-700'
											: 'bg-success-50 text-success-700'}"
										title="Points this request adds to or takes off the project coherence score"
									>
										{card.coherenceDelta > 0 ? '+' : ''}{card.coherenceDelta}
									</span>
								{/if}
								{#if card.highestImpactSeverity !== 'none'}
									<span
										class="rounded-pill px-1.5 py-0.5 text-[9px] font-semibold {SEVERITY_TONE[
											card.highestImpactSeverity
										]}"
										title="Worst impact severity found"
									>
										{card.highestImpactSeverity}
									</span>
								{/if}
								{#if card.hasUnliftedWaiver}
									<span
										class="inline-flex items-center gap-0.5 rounded-pill bg-accent-50 px-1.5 py-0.5 text-[9px] font-semibold text-accent-700"
										title="Crossed a gate on a waiver nobody has lifted yet"
									>
										<Icon name="flag" size={9} /> waiver
									</span>
								{/if}
								{#if card.acceptanceDebt > 0}
									<span
										class="rounded-pill bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold text-warning-700"
										title="Validated observations not folded back into the spec"
									>
										{card.acceptanceDebt} to fold back
									</span>
								{/if}
							</div>
						</article>
					{:else}
						<p class="px-1 py-3 text-center text-[11px] text-ink-300">
							{query ? 'No match here.' : 'Nothing in this stage.'}
						</p>
					{/each}
				</div>
			</section>
		{/each}
	</div>

	{#if store.requestsInStage('draft').length > 0}
		<!-- Drafts are not on the board: a request appears there once it is opened. -->
		<section class="rounded-card border border-dashed border-line bg-surface p-3">
			<p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Drafts, not yet opened
			</p>
			<div class="flex flex-wrap gap-2">
				{#each store.requestsInStage('draft') as request (request.id)}
					<button
						type="button"
						onclick={() => onOpen(request.id)}
						class="rounded-field border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-700 hover:border-brand-300 hover:text-brand-600"
					>
						{request.title || 'Untitled draft'}
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>
