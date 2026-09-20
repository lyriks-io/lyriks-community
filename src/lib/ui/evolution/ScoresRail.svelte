<script lang="ts">
	import { Button, Icon, ScoreRing } from '$ui/design-system';
	import {
		MATURITY_TIERS,
		type CoherenceReading,
		type MaturityReading,
		type ReadinessReading,
		type EvolutionRequest
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Three scores side by side, each with its meaning and what it does not
	 * measure: maturity (absence of holes), coherence (what the engine found,
	 * weighted by severity), readiness (average TRL of the touched features,
	 * with an admin's traced exclusion). None of them blocks a crossing by
	 * itself; what blocks is named underneath, and the gate reads that.
	 *
	 * `compact` is the one-line reading for a header; the full rail adds the
	 * per-block counts and the exclusion controls.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		maturity: MaturityReading;
		coherence: CoherenceReading;
		readiness: ReadinessReading;
		/** Open threads on the request, counted next to the open questions. */
		openThreads: number;
		compact?: boolean;
		/** Full rail only: jump to a critical empty field. */
		onGoTo?: (fieldPath: string) => void;
	}
	let { store, request, maturity, coherence, readiness, openThreads, compact = false, onGoTo }: Props =
		$props();

	const tierLabel = $derived(
		MATURITY_TIERS.find((t) => t.code === maturity.tier)?.label ?? maturity.tier
	);
	const tone = (score: number) => (score >= 100 ? 'strong' : score >= 55 ? 'at-risk' : 'critical');
	const canShape = $derived(store.actor.role === 'admin' || store.actor.role === 'owner');

	let excluding = $state<string | null>(null);
	let reason = $state('');
	function exclude(leafId: string) {
		if (store.excludeFromReadiness(request, leafId, reason)) {
			excluding = null;
			reason = '';
		}
	}
</script>

{#if compact}
	<div class="flex flex-wrap items-center gap-1.5 text-[10px]">
		<span
			class="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-600"
			title="Maturity: {maturity.statement} {maturity.neverBlocks}"
		>
			maturity {maturity.score}%
		</span>
		<span
			class="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-600"
			title="Coherence: {coherence.statement}"
		>
			coherence {coherence.available ? `${coherence.overall}%` : 'not run'}
		</span>
		<span
			class="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-600"
			title="Readiness: {readiness.statement}"
		>
			readiness {readiness.available ? `TRL ${readiness.average}` : 'unknown'}
		</span>
	</div>
{:else}
	<section class="rounded-card border border-line bg-surface p-4">
		<div class="grid gap-4 md:grid-cols-3">
			<!-- Maturity: how full. -->
			<div class="flex gap-3">
				<ScoreRing score={maturity.score} tone={tone(maturity.score)} size={52} />
				<div class="min-w-0">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Maturity</p>
					<p class="text-sm font-semibold text-ink-800">{tierLabel}</p>
					<p class="mt-1 text-[11px] leading-snug text-ink-500">{maturity.statement}</p>
					<p class="text-[11px] leading-snug text-ink-500">{maturity.neverBlocks}</p>
				</div>
			</div>

			<!-- Coherence: how consistent. -->
			<div class="flex gap-3">
				{#if coherence.available && coherence.overall !== null}
					<ScoreRing score={coherence.overall} tone={tone(coherence.overall)} size={52} />
				{:else}
					<div
						class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-dashed border-line text-[10px] text-ink-400"
					>
						not run
					</div>
				{/if}
				<div class="min-w-0">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Coherence</p>
					<p class="text-sm font-semibold text-ink-800">
						{#if coherence.available}
							{coherence.blockingUndecided} blocking undecided{coherence.delta !== 0
								? `, ${coherence.delta > 0 ? '+' : ''}${coherence.delta} from this request`
								: ''}
						{:else}
							Run the check at Challenge
						{/if}
					</p>
					<p class="mt-1 text-[11px] leading-snug text-ink-500">{coherence.statement}</p>
					{#if coherence.undecidedWeight > 0}
						<p class="mt-1 flex flex-wrap gap-1">
							{#each coherence.perAxis.filter((a) => a.weight > 0) as axis (axis.axis)}
								<span
									class="rounded-pill border border-line px-1.5 py-0.5 text-[9px] text-ink-500"
									title="{axis.blocking} blocking, {axis.major} major, {axis.minor} minor"
								>
									{axis.axis.replace(/_/g, ' ')} · {axis.weight}
								</span>
							{/each}
						</p>
					{/if}
				</div>
			</div>

			<!-- Readiness: how far along. -->
			<div class="flex gap-3">
				<div
					class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 {readiness.available
						? 'border-brand-300 text-brand-700'
						: 'border-dashed border-line text-ink-400'} text-sm font-bold"
					title="1 to 9; displayed, never typed"
				>
					{readiness.available ? `T${readiness.average}` : '?'}
				</div>
				<div class="min-w-0">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Readiness</p>
					<p class="text-sm font-semibold text-ink-800">
						{readiness.available ? `TRL ${readiness.average} on average` : 'No touched feature read yet'}
					</p>
					<p class="mt-1 text-[11px] leading-snug text-ink-500">{readiness.statement}</p>
					{#if readiness.leaves.length > 0}
						<ul class="mt-1 space-y-0.5">
							{#each readiness.leaves as leaf (leaf.leafId)}
								<li class="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-600">
									<span class="font-mono {leaf.excluded ? 'line-through text-ink-400' : ''}">
										{leaf.leafId}
									</span>
									<span class="text-ink-400">{leaf.trl === null ? 'no reading' : `TRL ${leaf.trl}`}</span>
									{#if leaf.exclusion}
										<span
											class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-ink-500"
											title="Excluded by {leaf.exclusion.by} on {leaf.exclusion.at.slice(0, 10)}"
										>
											excluded: {leaf.exclusion.reason}
										</span>
										{#if canShape}
											<button
												type="button"
												onclick={() => store.restoreToReadiness(request, leaf.leafId)}
												class="text-brand-600 hover:underline"
											>
												bring back
											</button>
										{/if}
									{:else if canShape}
										<button
											type="button"
											onclick={() => (excluding = excluding === leaf.leafId ? null : leaf.leafId)}
											class="text-ink-400 hover:text-ink-700 hover:underline"
											title="Take this feature out of the average, with a traced reason"
										>
											exclude
										</button>
									{/if}
								</li>
								{#if excluding === leaf.leafId}
									<li class="flex flex-wrap items-center gap-1.5">
										<input
											bind:value={reason}
											placeholder="Why it leaves the average (traced in the history)"
											class="min-w-[220px] flex-1 rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none focus:border-brand-400"
										/>
										<Button size="sm" onclick={() => exclude(leaf.leafId)}>Exclude</Button>
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- What blocks, named. A number never does. -->
		<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[11px]">
			<span class="font-semibold uppercase tracking-wide text-ink-400">What blocks</span>
			{#if maturity.criticalEmptyCount === 0 && coherence.blockingUndecided === 0}
				<span class="text-success-700">Nothing: the gate is open on the specification side.</span>
			{/if}
			{#each maturity.criticalEmptyFields as path (path)}
				<button
					type="button"
					onclick={() => onGoTo?.(path)}
					class="rounded-pill border border-warning-200 bg-warning-50 px-2 py-0.5 font-mono text-[10px] text-warning-700 hover:border-warning-300"
					title="A critical field still empty. Its emptiness alone bars the Ready tier."
				>
					{path}
				</button>
			{/each}
			{#if coherence.blockingUndecided > 0}
				<span class="rounded-pill border border-danger-200 bg-danger-50 px-2 py-0.5 text-[10px] text-danger-700">
					{coherence.blockingUndecided} blocking {coherence.blockingUndecided === 1 ? 'finding' : 'findings'} undecided
				</span>
			{/if}
			<span class="ml-auto flex items-center gap-2 text-ink-400">
				{#if maturity.openQuestionCount > 0}
					<span class="inline-flex items-center gap-1" title="Declared unknowns, counted as empty">
						<Icon name="circle-question-mark" size={10} />
						{maturity.openQuestionCount} open
					</span>
				{/if}
				{#if openThreads > 0}
					<span class="inline-flex items-center gap-1" title="Threads where someone is waiting">
						<Icon name="message-circle" size={10} />
						{openThreads} threads
					</span>
				{/if}
			</span>
		</div>

		<!-- Per block: filled over total, and the open questions. -->
		<ul class="mt-2 flex flex-wrap gap-1">
			{#each maturity.perBlock as b (b.block.id)}
				<li
					class="rounded-pill border border-line px-2 py-0.5 text-[10px] text-ink-500"
					title="{b.block.title}: {b.state.replace('_', ' ')}{b.parked ? ', parked' : ''}"
				>
					<span class="font-mono">{b.block.id.slice(0, 2)}</span>
					{b.filled}/{b.block.fields.length}
					{#if b.openQuestions > 0}<span class="text-warning-700"> · {b.openQuestions} open</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
