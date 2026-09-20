<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		MATURITY_TIERS,
		type CoherenceReading,
		type MaturityReading,
		type ReadinessReading,
		type SpecAct,
		type SpecBlock
	} from '$domain/evolution';

	/**
	 * The sticky rail of the Specify page: where the reader is in the five
	 * acts, how full each one is, what blocks, and the two ways back into the
	 * holes. Three scores at the top, each with its meaning; none of them ever
	 * blocks by itself.
	 */
	interface Props {
		acts: readonly { act: SpecAct; blocks: SpecBlock[] }[];
		maturity: MaturityReading;
		coherence: CoherenceReading;
		readiness: ReadinessReading;
		openThreads: number;
		activeActId: string;
		pendingCount: number;
		onJump: (actId: string) => void;
		onGoTo: (fieldPath: string) => void;
		onResume: () => void;
		onFillTheGaps: () => void;
	}
	let {
		acts,
		maturity,
		coherence,
		readiness,
		openThreads,
		activeActId,
		pendingCount,
		onJump,
		onGoTo,
		onResume,
		onFillTheGaps
	}: Props = $props();

	const tierLabel = $derived(
		MATURITY_TIERS.find((t) => t.code === maturity.tier)?.label ?? maturity.tier
	);
	const readingOf = (block: SpecBlock) => maturity.perBlock.find((p) => p.block.id === block.id);
	const actCounts = (blocks: SpecBlock[]) => {
		const readings = blocks.map(readingOf);
		return {
			filled: readings.reduce((n, r) => n + (r?.filled ?? 0), 0),
			total: blocks.reduce((n, b) => n + b.fields.length, 0),
			open: readings.reduce((n, r) => n + (r?.openQuestions ?? 0), 0)
		};
	};
</script>

<aside class="space-y-4 lg:sticky lg:top-4">
	<!-- Three numbers, three questions, no composite. -->
	<div class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-baseline justify-between">
			<span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Maturity</span>
			<span class="text-2xl font-bold tabular-nums text-ink-900">{maturity.score}%</span>
		</div>
		<div class="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
			<div class="h-full rounded-pill bg-brand-500 transition-all" style="width: {maturity.score}%"></div>
		</div>
		<p class="mt-1.5 text-[11px] text-ink-600">{tierLabel}. {maturity.neverBlocks}</p>
		<dl class="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px]">
			<div class="flex items-center justify-between gap-2" title={coherence.statement}>
				<dt class="text-ink-500">Coherence</dt>
				<dd class="font-semibold tabular-nums text-ink-800">
					{coherence.available ? `${coherence.overall}%` : 'not run yet'}
				</dd>
			</div>
			<div class="flex items-center justify-between gap-2" title={readiness.statement}>
				<dt class="text-ink-500">Readiness</dt>
				<dd class="font-semibold tabular-nums text-ink-800">
					{readiness.available ? `TRL ${readiness.average}` : 'unknown'}
				</dd>
			</div>
		</dl>
		{#if maturity.criticalEmptyCount > 0 || coherence.blockingUndecided > 0}
			<div class="mt-3 border-t border-line pt-3">
				<p class="text-[10px] font-semibold uppercase tracking-wide text-ink-400">What blocks</p>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each maturity.criticalEmptyFields as path (path)}
						<button
							type="button"
							onclick={() => onGoTo(path)}
							class="rounded-pill border border-warning-200 bg-warning-50 px-1.5 py-0.5 font-mono text-[9px] text-warning-700 hover:border-warning-300"
							title="A critical field still empty"
						>
							{path.split('.')[1] ?? path}
						</button>
					{/each}
					{#if coherence.blockingUndecided > 0}
						<span class="rounded-pill border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[9px] text-danger-700">
							{coherence.blockingUndecided} blocking undecided
						</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- The five acts, and how far each has got. -->
	<nav class="space-y-0.5" aria-label="The five acts">
		{#each acts as { act, blocks }, i (act.id)}
			{@const counts = actCounts(blocks)}
			{@const complete = counts.total > 0 && counts.filled === counts.total}
			<button
				type="button"
				onclick={() => onJump(act.id)}
				class="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left transition {activeActId ===
				act.id
					? 'bg-surface-sunken text-ink-900'
					: 'text-ink-600 hover:bg-surface-sunken/60'}"
			>
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] {complete
						? 'border-success-300 bg-success-50 text-success-700'
						: activeActId === act.id
							? 'border-brand-300 text-brand-700'
							: 'border-line text-ink-400'}"
				>
					{complete ? '✓' : String(i + 1).padStart(2, '0')}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[12.5px] font-semibold">{act.title}</span>
					<span class="block font-mono text-[10px] text-ink-400">
						{counts.filled}/{counts.total}{counts.open > 0 ? ` · ${counts.open} open` : ''}
					</span>
				</span>
			</button>
		{/each}
	</nav>

	<div class="flex flex-col gap-1.5">
		<Button size="sm" onclick={onFillTheGaps} title={pendingCount > 0 ? `${pendingCount} to ask about, one per screen` : 'Nothing is left to ask'}>
			<Icon name="circle-question-mark" size={13} /> Fill the gaps{pendingCount > 0 ? ` (${pendingCount})` : ''}
		</Button>
		<Button variant="outline" size="sm" onclick={onResume}>
			<Icon name="arrow-right" size={13} /> Resume at the first hole
		</Button>
		{#if maturity.openQuestionCount > 0 || openThreads > 0}
			<p class="text-[10px] text-ink-400">
				{#if maturity.openQuestionCount > 0}{maturity.openQuestionCount} open {maturity.openQuestionCount === 1 ? 'question' : 'questions'}{/if}{#if maturity.openQuestionCount > 0 && openThreads > 0} · {/if}{#if openThreads > 0}{openThreads} {openThreads === 1 ? 'thread' : 'threads'} waiting{/if}
			</p>
		{/if}
	</div>
</aside>
