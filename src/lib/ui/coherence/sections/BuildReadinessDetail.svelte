<script lang="ts">
	import { MATURITY_DIMENSION_KEY } from '$domain/coherence';
	import { MaturityBar, MATURITY_STAGE_COUNT, stageFromScore, stageLabel } from '$ui/design-system';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
	}
	let { store }: Props = $props();

	const structural = $derived(
		store.analysis.dimensions.filter((dimension) => dimension.key !== MATURITY_DIMENSION_KEY)
	);
	const coverage = $derived(
		structural.length
			? Math.round(structural.reduce((sum, dimension) => sum + dimension.score, 0) / structural.length)
			: 0
	);
	const maturity = $derived(
		store.analysis.dimensions.find((dimension) => dimension.key === MATURITY_DIMENSION_KEY)?.score ?? 0
	);
</script>

<div class="space-y-4">
	<div class="rounded-card border border-brand-200 bg-brand-50/50 p-4">
		<div class="flex items-end justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">Build readiness</p>
				<p class="mt-1 text-3xl font-extrabold text-brand-700">
					{stageLabel(stageFromScore(store.readiness))}<span class="text-base font-bold text-ink-400"> · {stageFromScore(store.readiness)}/{MATURITY_STAGE_COUNT}</span>
				</p>
				<MaturityBar score={store.readiness} class="mt-2 max-w-[240px]" />
			</div>
			<p class="max-w-md text-right text-xs leading-relaxed text-ink-500">
				The build gate combines structural coverage with authored behavior depth. Blocking coherence
				issues remain a separate stop condition.
			</p>
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-3">
		<div class="rounded-lg border border-line bg-surface-sunken/40 p-3">
			<p class="text-xl font-bold text-info-600">{coverage}%</p>
			<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Coverage input</p>
		</div>
		<div class="rounded-lg border border-line bg-surface-sunken/40 p-3">
			<p class="text-xl font-bold text-accent-600">{maturity}%</p>
			<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Behavior input</p>
		</div>
		<div class="rounded-lg border border-line bg-surface-sunken/40 p-3">
			<p class="text-xl font-bold text-ink-800">{store.draft.threshold}%</p>
			<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Required threshold</p>
		</div>
	</div>
</div>
