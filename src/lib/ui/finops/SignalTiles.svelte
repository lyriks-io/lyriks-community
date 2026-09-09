<script lang="ts">
	import { Icon, MaturityBar, stageFromScore, stageLabel } from '$ui/design-system';
	import type { FinopsStore } from './draft-store.svelte';

	interface Props {
		store: FinopsStore;
	}
	let { store }: Props = $props();

	type State = 'ok' | 'warn' | 'bad';
	const dot: Record<State, string> = {
		ok: 'bg-success-500',
		warn: 'bg-accent-500',
		bad: 'bg-danger-500'
	};
	const val: Record<State, string> = {
		ok: 'text-ink-900',
		warn: 'text-accent-600',
		bad: 'text-danger-600'
	};

	const readinessState = $derived<State>(
		store.readiness >= store.draft.maturityThreshold ? 'ok' : 'bad'
	);
	const coherenceState = $derived<State>(
		store.signals.coherenceScore >= store.draft.coherenceThreshold ? 'ok' : 'warn'
	);
	const gapsState = $derived<State>(store.signals.blockingGapCount === 0 ? 'ok' : 'bad');
	const budgetState = $derived<State>(
		store.ratio > 1 ? 'bad' : store.ratio > store.draft.budgetTightenRatio ? 'warn' : 'ok'
	);
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<!-- Readiness -->
	<article class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-center justify-between">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Readiness</p>
			<span class="size-2 rounded-full {dot[readinessState]}"></span>
		</div>
		<p class="mt-1 text-2xl font-bold {val[readinessState]}">{stageLabel(stageFromScore(store.readiness))}</p>
		<MaturityBar score={store.readiness} class="mt-1.5" />
		<p class="mt-1 text-[11px] text-ink-400">
			Needs ≥ {stageLabel(stageFromScore(store.draft.maturityThreshold))}. How buildable the spec is.
		</p>
	</article>

	<!-- Coherence -->
	<article class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-center justify-between">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Coherence</p>
			<span class="size-2 rounded-full {dot[coherenceState]}"></span>
		</div>
		<p class="mt-1 text-2xl font-bold {val[coherenceState]}">{store.signals.coherenceScore}</p>
		<p class="mt-1 text-[11px] text-ink-400">
			Below {store.draft.coherenceThreshold} → cheaper model. How well it holds together.
		</p>
	</article>

	<!-- Blocking gaps -->
	<article class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-center justify-between">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Blocking gaps</p>
			<span class="size-2 rounded-full {dot[gapsState]}"></span>
		</div>
		<p class="mt-1 text-2xl font-bold {val[gapsState]}">{store.signals.blockingGapCount}</p>
		<p class="mt-1 text-[11px] text-ink-400">Contradictions that must be fixed before spending.</p>
	</article>

	<!-- Budget -->
	<article class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-center justify-between">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Budget used</p>
			<span class="size-2 rounded-full {dot[budgetState]}"></span>
		</div>
		<p class="mt-1 text-2xl font-bold {val[budgetState]}">{Math.round(store.ratio * 100)}%</p>
		<div class="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
			<div
				class="h-full rounded-pill {dot[budgetState]}"
				style="width: {Math.min(100, Math.round(store.ratio * 100))}%"
			></div>
		</div>
		<p class="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
			<Icon name="gauge" size={11} /> ${store.draft.spentUsd} of ${store.draft.monthlyBudgetUsd}
		</p>
	</article>
</div>
