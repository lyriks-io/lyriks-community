<script lang="ts">
	import { Icon, stageFromScore, stageLabel } from '$ui/design-system';
	import type { FinopsStore } from '$ui/finops/draft-store.svelte';

	/**
	 * The AI-governance chain, made visible: how a specification signal becomes a
	 * compiled rule, then a gateway decision, then attributed usage. Every value is
	 * read live from the existing FinOps store — this only *shows* the wiring that
	 * `compileRules` / `governorVerdict` / the gateway push already implement; it
	 * adds no new engine. The decision + usage stages jump to the AI Gateway tab.
	 */
	interface Props {
		finops: FinopsStore;
		onOpenGateway?: () => void;
	}
	let { finops, onOpenGateway }: Props = $props();

	// Verdict level → tone. Mirrors the gateway headline the tab bar shows.
	const decisionTone = $derived(
		finops.verdict.level === 'clear'
			? 'text-success-600'
			: finops.verdict.level === 'guardrails'
				? 'text-warning-600'
				: 'text-danger-500'
	);

	const budgetLabel = $derived(
		finops.draft.monthlyBudgetUsd > 0
			? `$${Math.round(finops.draft.spentUsd)} / $${Math.round(finops.draft.monthlyBudgetUsd)}`
			: `$${Math.round(finops.draft.spentUsd)} spent`
	);
	const budgetSub = $derived(
		finops.draft.monthlyBudgetUsd > 0
			? `${Math.round(finops.ratio * 100)}% of the monthly cap`
			: 'No monthly cap set'
	);
	const ruleCount = $derived(finops.activeRules.length);
	const pendingCount = $derived(finops.recommendation.length);
</script>

<section class="mb-6 rounded-card border border-line bg-surface p-4">
	<p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
		How the specification governs AI usage
	</p>
	<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
		<!-- 1 · Specification signal -->
		<div class="flex-1 rounded-field border border-line bg-surface-sunken/50 px-3 py-2.5">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Specification signal
			</p>
			<p class="mt-1 text-sm font-bold text-ink-800">
				Readiness {stageLabel(stageFromScore(finops.signals.readinessScore))} · Coherence {finops.signals.coherenceScore}
			</p>
			<p class="text-[11px] text-ink-500">
				{finops.signals.blockingGapCount} blocking coherence gap{finops.signals.blockingGapCount === 1
					? ''
					: 's'}
			</p>
		</div>

		<span class="hidden self-center text-ink-300 lg:block"><Icon name="arrow-right" size={16} /></span>

		<!-- 2 · Compiled rule -->
		<div class="flex-1 rounded-field border border-line bg-surface-sunken/50 px-3 py-2.5">
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Compiled rules</p>
			<p class="mt-1 text-sm font-bold text-ink-800">
				{ruleCount} active guardrail{ruleCount === 1 ? '' : 's'}
			</p>
			<p class="text-[11px] text-ink-500">
				{pendingCount === 0
					? 'Nothing warranted right now'
					: `${pendingCount} recommended from the current signal`}
			</p>
		</div>

		<span class="hidden self-center text-ink-300 lg:block"><Icon name="arrow-right" size={16} /></span>

		<!-- 3 · Gateway decision -->
		<button
			type="button"
			onclick={onOpenGateway}
			class="flex-1 rounded-field border border-line bg-surface-sunken/50 px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-surface"
		>
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Gateway decision
			</p>
			<p class="mt-1 text-sm font-bold {decisionTone}">{finops.verdict.headline}</p>
			<p class="truncate text-[11px] text-ink-500">{finops.verdict.tagline}</p>
		</button>

		<span class="hidden self-center text-ink-300 lg:block"><Icon name="arrow-right" size={16} /></span>

		<!-- 4 · Attributed usage -->
		<button
			type="button"
			onclick={onOpenGateway}
			class="flex-1 rounded-field border border-line bg-surface-sunken/50 px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-surface"
		>
			<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
				Attributed usage
			</p>
			<p class="mt-1 text-sm font-bold text-ink-800">{budgetLabel}</p>
			<p class="text-[11px] text-ink-500">{budgetSub}</p>
		</button>
	</div>
</section>
