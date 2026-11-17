<script lang="ts">
	/**
	 * The behavior figures, read from the overview the Features page loads: the
	 * whole product's totals, or one feature's own figures when `featureId` names
	 * it. Shown in the popover of a stats icon (the toolbar's for the product, a
	 * row's for its feature); they used to be the card of the Behavior tab.
	 */
	import type { BehaviorOverview } from '$application/specification/summarize-behavior';
	import type { FeatureImplementationCoverage } from '$application/use-cases';

	interface Props {
		overview: BehaviorOverview;
		/** Per-leaf code-implementation coverage, for the adoption figures. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		/** One feature's figures instead of the product's totals. */
		featureId?: string | null;
	}
	let { overview, implementation = new Map(), featureId = null }: Props = $props();

	type Stat = { label: string; value: string | number; hint?: string; alert?: boolean };

	// Two readings, deliberately not one: how much of the product a code sync has
	// mapped at all, then how much of THAT it located in code.
	const productStats = $derived.by<Stat[]>(() => {
		let found = 0;
		let expected = 0;
		for (const row of implementation.values()) {
			found += row.found;
			expected += row.expected;
		}
		const overCap = overview.features.filter((f) => f.overCap);
		const t = overview.totals;
		return [
			{ label: 'Features', value: overview.features.length },
			{ label: 'Surfaces', value: t.surfaces },
			{ label: 'Actions', value: t.actions },
			{ label: 'Rules', value: t.rules },
			{ label: 'Invariants', value: t.invariants },
			{ label: 'Effects', value: t.effects },
			{ label: 'Transitions', value: t.transitions },
			{ label: 'State defs', value: t.stateDefinitions },
			{ label: 'Scenarios', value: t.scenarios },
			{ label: 'Events', value: t.events },
			{ label: 'Entities', value: t.entities },
			{ label: 'Personas', value: t.personas },
			{ label: 'Resources', value: t.resources },
			{ label: 'Reach. goals', value: t.reachabilityGoals },
			...(expected > 0
				? [
						{
							label: 'Adopted',
							value: `${implementation.size}/${overview.features.length}`,
							hint: `${implementation.size} of ${overview.features.length} features have been mapped to code by a code-adoption sync. The others are not measured at all.`
						},
						{
							label: 'Located in those',
							value: `${Math.round((found / expected) * 100)}%`,
							hint: `${found} of ${expected} spec elements located in code, counting ONLY the ${implementation.size} adopted feature(s), per the last code-adoption sync`
						}
					]
				: []),
			// A feature past the size cap (15 surfaces / 100 actions) should be split.
			...(overCap.length > 0
				? [
						{
							label: 'Over size cap',
							value: overCap.length,
							hint: `To split (over 15 surfaces or 100 actions): ${overCap.map((f) => f.name).join(', ')}`,
							alert: true
						}
					]
				: [])
		];
	});

	const feature = $derived(
		featureId ? (overview.features.find((f) => f.featureId === featureId) ?? null) : null
	);
	const featureStats = $derived.by<Stat[]>(() => {
		if (!feature) return [];
		const coverage = implementation.get(feature.featureId);
		return [
			{ label: 'Maturity', value: `${feature.maturity}%` },
			{ label: 'Surfaces', value: feature.surfaceCount },
			{ label: 'Actions', value: feature.actionCount },
			{ label: 'Rules', value: feature.ruleCount },
			{ label: 'Invariants', value: feature.invariantCount },
			{ label: 'Effects', value: feature.effectCount },
			{ label: 'State defs', value: feature.stateCount },
			{ label: 'Scenarios', value: feature.scenarioCount },
			{ label: 'Events', value: feature.eventCount },
			{ label: 'Entities', value: feature.entityCount },
			{ label: 'Personas', value: feature.personaCount },
			{ label: 'Acceptance', value: feature.acceptanceCriteria.length },
			...(coverage && coverage.expected > 0
				? [
						{
							label: 'Located in code',
							value: `${coverage.percent}%`,
							hint: `${coverage.found} of ${coverage.expected} spec elements located in code, per the last code-adoption sync`
						}
					]
				: []),
			...(feature.overCap
				? [{ label: 'Over size cap', value: 'split it', hint: 'Over 15 surfaces or 100 actions.', alert: true }]
				: [])
		];
	});

	const stats = $derived(featureId ? featureStats : productStats);
</script>

{#if featureId && !feature}
	<p class="px-3 py-2 text-[0.75rem] text-ink-500">No behavior authored for this feature yet.</p>
{:else}
	<dl class="divide-y divide-line/60 px-3">
		{#each stats as stat (stat.label)}
			<div class="flex items-baseline justify-between gap-3 py-1.5" title={stat.hint}>
				<dt class="text-[0.75rem] {stat.alert ? 'text-danger-500' : 'text-ink-600'}">{stat.label}</dt>
				<dd
					class="font-mono text-[0.78125rem] font-semibold tabular-nums {stat.alert
						? 'text-danger-500'
						: 'text-ink-900'}"
				>
					{stat.value}
				</dd>
			</div>
		{/each}
	</dl>
{/if}
