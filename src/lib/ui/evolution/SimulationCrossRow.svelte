<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { CrossEvolutionReading } from '$lib/server/evolution-cross.server';
	import { orderWords, type crossWords } from './impact-board';
	import { KICKER, SECONDARY_44 } from './evo-look';
	import { CROSS_BADGE } from './SimulationSummary.svelte';

	/**
	 * One evolution in progress, read against the request (the design's 4.4 row):
	 * its verdict, then, opened, for each feature or table they share, what each
	 * side writes into it, whether they write the same rule, and what to do; or
	 * why it fits or is not checked yet. The other request is one click away on
	 * its own page.
	 *
	 * Two requests that share something read which lands first (EVO-005): a
	 * person who writes the request sets it from this row, Lands first or Lands
	 * after, and a conflict is decided there too, by the order or by accepting
	 * the risk with a reason. A reader sees the order, not the controls. No
	 * notice is sent to the other request's owner: the board and its own
	 * Simulation say it.
	 */
	interface Props {
		cross: CrossEvolutionReading;
		words: ReturnType<typeof crossWords>;
		open: boolean;
		onToggle: () => void;
		/** Whose side the first column reads, where no evolution is "this one" (the concurrent impact report). */
		hereLabel?: string;
		/** Its element id where the same evolution reads in several rows. */
		rowId?: string;
		/** The order and the conflict, set from the row by someone who writes the request; absent where nobody may (a reader, a report). */
		ordering?: { readonly onSet: (landsFirst: 'this' | 'other') => void; readonly onAcceptRisk: () => void } | null;
	}
	let { cross, words, open, onToggle, hereLabel = 'This evolution', rowId, ordering = null }: Props = $props();

	const badge = $derived(CROSS_BADGE[cross.verdict]);
	const conflict = $derived(cross.verdict === 'conflict');
	const key = $derived(cross.key ?? cross.title);
	/** Lands before, lands after, or not ordered yet: only a pair that shares something is ordered (criterion 4162228b). */
	const order = $derived(orderWords({ key, verdict: cross.verdict, order: cross.order ?? null, decision: cross.decision ?? null }));
	const settable = $derived(!!ordering && cross.open !== false && !!order);
</script>

<div id={rowId ?? `xe-${cross.id}`} class="border-t border-line">
	<button type="button" class="flex min-h-[60px] w-full flex-wrap items-center gap-3.5 px-5 py-3 text-left text-evo-ink" aria-expanded={open} onclick={onToggle}>
		<span class="w-[108px] flex-none px-[9px] py-[3px] text-center text-[0.6875rem] font-bold tracking-[0.06em] {badge.look}">{badge.word}</span>
		<span class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
			<span class="font-bold">{words.head}</span>
			{#if !words.issue}
				<span class="text-[0.8125rem] text-ink-3"><span class="font-evo-mono text-xs">{key}</span> · {words.sub}</span>
			{/if}
			{#if order}
				<span class="text-[0.8125rem] text-ink-2" data-order={cross.order ?? 'none'}><span class="font-evo-mono text-xs">{key}</span> · {order.line}</span>
			{/if}
		</span>
		<span aria-hidden="true" class="grid size-7 flex-none place-items-center text-ink transition-transform duration-200 {open ? 'rotate-180' : ''}"><Icon name="chevron-down" size={18} /></span>
	</button>
	{#if open}
		<div class="animate-lk-in-fast flex flex-col gap-4 px-5 pb-5">
			{#if !words.issue}
				<p class="max-w-[820px] leading-[1.6]">
					{words.explain}
					<a class="font-semibold text-blue-ink hover:underline" href={cross.href}>Open {key} →</a>
				</p>
			{:else}
				<p class="leading-[1.6] text-ink-3">
					<a class="font-semibold text-blue-ink hover:underline" href={cross.href}>{key} · {cross.title}</a> is at the {words.step} step.
				</p>
				{#if order}
					<div class="flex flex-wrap items-center gap-2.5" aria-label="Landing order with {key}">
						{#if order.decided}<span class="min-w-0 flex-[1_1_320px] text-[0.8125rem] leading-normal {cross.verdict === 'conflict' && !cross.decision ? 'text-red-ink' : 'text-ink-2'}">{order.decided}</span>{/if}
						{#if settable && ordering}
							<button type="button" class="{SECONDARY_44} min-h-9" aria-pressed={cross.order === 'before'} aria-label="{key} lands first" onclick={() => ordering.onSet('other')}>Lands first</button>
							<button type="button" class="{SECONDARY_44} min-h-9" aria-pressed={cross.order === 'after'} aria-label="{key} lands after" onclick={() => ordering.onSet('this')}>Lands after</button>
							{#if cross.verdict === 'conflict' && !cross.decision}
								<button type="button" class="{SECONDARY_44} min-h-9" onclick={ordering.onAcceptRisk}>Accept the risk</button>
							{/if}
						{/if}
					</div>
				{/if}
				{#each words.meets as meet, i (i)}
					<div class="overflow-hidden rounded-xl border-[1.5px] bg-paper {conflict ? 'border-red-ink' : 'border-orange-ink'}">
						<div class="px-5 pt-4 text-[0.8125rem] font-bold text-evo-ink">{meet.what}</div>
						<div class="flex flex-wrap items-stretch">
							{#each [{ kicker: hereLabel, lines: meet.here }, { kicker: key, lines: meet.there }] as side, s (s)}
								{#if s === 1}
									<div class="relative flex flex-none items-center justify-center px-1" aria-hidden="true">
										<span class="absolute top-4 bottom-4 left-1/2 border-l border-dashed {conflict ? 'border-red' : 'border-orange'}"></span>
										<span
											class="relative grid size-8 place-items-center border font-evo-mono text-base font-bold {conflict
												? 'border-red-ink bg-red-ink text-paper'
												: 'border-orange bg-orange text-ink'}">{meet.clash ? '≠' : '+'}</span
										>
									</div>
								{/if}
								<div class="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 px-5 py-3.5">
									<span class={KICKER}>{side.kicker}</span>
									{#if side.lines.length === 1}
										<span class="leading-normal text-evo-ink">{side.lines[0]}</span>
									{:else}
										<ul class="flex list-disc flex-col gap-1.5 pl-4 leading-normal text-evo-ink">
											{#each side.lines as line, l (l)}<li>{line}</li>{/each}
										</ul>
									{/if}
								</div>
							{/each}
						</div>
						<div class="flex flex-col gap-2 px-5 py-3 {conflict ? 'bg-red-tint' : 'bg-orange-tint'}">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5 {conflict ? 'text-red-ink' : 'text-orange-ink'}">
								<span class="flex-none sm:w-31 font-evo-mono text-xs tracking-[0.08em] uppercase">{meet.label}</span>
								<span class="leading-normal">{meet.point}</span>
							</div>
							<div class="flex flex-col gap-1 text-evo-ink sm:flex-row sm:items-baseline sm:gap-2.5">
								<span class="flex-none sm:w-31 font-evo-mono text-xs tracking-[0.08em] uppercase">What to do</span>
								<span class="leading-normal">{meet.todo}</span>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>
