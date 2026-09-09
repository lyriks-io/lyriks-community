<script lang="ts">
	import { Icon, stageFromScore, stageFromTrl, stageLabel } from '$ui/design-system';
	import {
		unspaDashboardBase,
		unspaFeatureHref,
		unspaFeaturePath,
		unspaProjectHref
	} from '$ui/features/unspa-dashboard-url';
	import type { BehaviorFeatureSummary } from '$application/summarize-behavior';
	import type { BehaviorOverview } from '$application/summarize-behavior';
	import type { FeatureAdvice, FeatureImplementationCoverage } from '$application/use-cases';
	import ImplementationBadge from '../ImplementationBadge.svelte';

	interface Props {
		overview: BehaviorOverview;
		dashboardProjectId: string | null;
		/** Engine maturity advice — the SAME source the Core & features tab uses, so
		    the per-feature scores match instead of diverging. */
		advice?: FeatureAdvice[];
		/** Releases + their feature assignments, to group the behavior by release. */
		releases?: { id: string; name: string; version: string; order: number }[];
		assignments?: { featureId: string; releaseId: string }[];
		/** Hand-set TRL overrides, keyed by feature id (same as kernel feature id). */
		manualTrl?: ReadonlyMap<string, number>;
		/** Per-leaf code-implementation coverage (adoption sidecar); empty = no stat. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		/** Switches to the embedded editor sub-tab, on `path` (null = the project). */
		onOpenEditor: (path?: string | null) => void;
	}
	let {
		overview,
		dashboardProjectId,
		advice = [],
		releases = [],
		assignments = [],
		manualTrl = new Map(),
		implementation = new Map(),
		onOpenEditor
	}: Props = $props();

	// Project-wide implementation coverage, aggregated over the leaves that have
	// a sidecar. Null (no stat card at all) until at least one feature was
	// adopted: the figure only exists when a score exists.
	const implTotals = $derived.by(() => {
		let found = 0;
		let expected = 0;
		for (const row of implementation.values()) {
			found += row.found;
			expected += row.expected;
		}
		if (expected === 0) return null;
		return {
			percent: Math.round((found / expected) * 100),
			found,
			expected,
			features: implementation.size
		};
	});

	// The engine maturity % per feature (the SAME number the tree's advisor badge
	// shows) — keyed by kernel feature id, so the two tabs stop diverging.
	const scoreByFeature = $derived(
		new Map(advice.map((a) => [a.featureId, a.score?.percentage ?? null]))
	);

	// Spec maturity as a stage: a hand-set level (stored 1-9) wins over the
	// maturity score.
	const stageOf = (featureId: string, maturity: number): number | null => {
		const manual = manualTrl.get(featureId);
		if (manual != null) return stageFromTrl(manual);
		const s = scoreByFeature.get(featureId) ?? maturity;
		return s != null ? stageFromScore(s) : null;
	};
	const stageTone = (l: number): string =>
		l >= 4
			? 'bg-success-50 text-success-600'
			: l >= 2
				? 'bg-warning-50 text-warning-600'
				: 'bg-danger-50 text-danger-500';
	// Feature → release, and releases in schedule order, to section the list.
	const releaseOf = $derived(new Map(assignments.map((a) => [a.featureId, a.releaseId])));
	const orderedReleases = $derived([...releases].sort((a, b) => a.order - b.order));
	const releaseGroups = $derived(
		orderedReleases
			.map((rel) => ({
				rel,
				features: overview.features.filter((f) => releaseOf.get(f.featureId) === rel.id)
			}))
			.filter((g) => g.features.length > 0)
	);
	const scheduledIds = $derived(
		new Set(releaseGroups.flatMap((g) => g.features.map((f) => f.featureId)))
	);
	const unscheduledFeatures = $derived(
		overview.features.filter((f) => !scheduledIds.has(f.featureId))
	);

	// Behavior-editor links, brand-tagged (see unspa-dashboard-url). `null` only
	// during SSR without a configured URL — links render after hydration.
	const editorBase = unspaDashboardBase();
	const projectHref = $derived(
		dashboardProjectId ? unspaProjectHref(dashboardProjectId, editorBase) : null
	);
	const featureHref = (id: string) => unspaFeatureHref(id, editorBase);

	const hasBehavior = $derived(
		overview.features.length > 0 || overview.shared.length > 0 || overview.totals.surfaces > 0
	);

	// Every counter the kernel folds — a 0 is signal too (e.g. no invariants =
	// nothing formally guarded yet), so all cards render even when empty.
	const stats = $derived([
		{ label: 'Features', value: overview.features.length },
		{ label: 'Surfaces', value: overview.totals.surfaces },
		{ label: 'Actions', value: overview.totals.actions },
		{ label: 'Rules', value: overview.totals.rules },
		{ label: 'Invariants', value: overview.totals.invariants },
		{ label: 'Effects', value: overview.totals.effects },
		{ label: 'Transitions', value: overview.totals.transitions },
		{ label: 'State defs', value: overview.totals.stateDefinitions },
		{ label: 'Scenarios', value: overview.totals.scenarios },
		{ label: 'Events', value: overview.totals.events },
		{ label: 'Entities', value: overview.totals.entities },
		{ label: 'Personas', value: overview.totals.personas },
		{ label: 'Resources', value: overview.totals.resources },
		{ label: 'Reach. goals', value: overview.totals.reachabilityGoals },
		// Two readings, deliberately not one. Coverage is measured only over the
		// features a code-adoption sync has actually mapped, so a single feature
		// mapped well used to put "Implemented 98%" beside "Features 37" and read
		// as a project nearly built. How much of the product is mapped at all is
		// the first question, and only the second one is a percentage.
		...(implTotals
			? [
					{
						label: 'Adopted',
						value: `${implTotals.features}/${overview.features.length}`,
						hint: `${implTotals.features} of ${overview.features.length} features have been mapped to code by a code-adoption sync. The others are not measured at all.`
					},
					{
						label: 'Located in those',
						value: `${implTotals.percent}%`,
						hint: `${implTotals.found} of ${implTotals.expected} spec elements located in code, counting ONLY the ${implTotals.features} adopted feature(s), per the last code-adoption sync`
					}
				]
			: [])
	]);
</script>

{#snippet featureRow(f: BehaviorFeatureSummary, shared: boolean)}
	{@const href = featureHref(f.featureId)}
	{@const stage = stageOf(f.featureId, f.maturity)}
	<li data-anchor={f.featureId} class="flex items-center gap-3 px-4 py-3">
		<!-- The two readings of a feature, stacked: how deeply it is SPECIFIED
		     (maturity stage) and how much of that spec the last code sync located
		     in code. The implementation chip renders itself away when the feature
		     was never adopted, so a spec-only project keeps the exact same row. -->
		<span class="flex w-20 shrink-0 flex-col items-start gap-1">
			{#if stage != null}
				<span
					class="inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[10px] font-semibold {stageTone(stage)}"
				>
					{stageLabel(stage)}
				</span>
			{:else}
				<span class="text-[10px] text-ink-400">-</span>
			{/if}
			<ImplementationBadge coverage={implementation.get(f.featureId)} />
		</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="truncate text-sm font-semibold text-ink-800">{f.name}</p>
				{#if shared}
					<span class="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-400">
						Shared
					</span>
				{/if}
				{#if !f.authored}
					<span class="shrink-0 rounded-pill bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning-600">
						No behavior yet
					</span>
				{:else if f.overCap}
					<span class="shrink-0 rounded-pill bg-danger-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-danger-500">
						Over size cap
					</span>
				{/if}
			</div>
			<p class="mt-0.5 text-[11px] text-ink-500">
				{f.surfaceCount} surface{f.surfaceCount === 1 ? '' : 's'} ·
				{f.actionCount} action{f.actionCount === 1 ? '' : 's'} ·
				{f.scenarioCount} scenario{f.scenarioCount === 1 ? '' : 's'}
				{#if f.ruleCount > 0}· {f.ruleCount} rule{f.ruleCount === 1 ? '' : 's'}{/if}
				{#if f.invariantCount > 0}· {f.invariantCount} invariant{f.invariantCount === 1 ? '' : 's'}{/if}
				{#if f.effectCount > 0}· {f.effectCount} effect{f.effectCount === 1 ? '' : 's'}{/if}
				{#if f.eventCount > 0}· {f.eventCount} event{f.eventCount === 1 ? '' : 's'}{/if}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				onclick={() => onOpenEditor(unspaFeaturePath(f.featureId))}
				class="inline-flex items-center gap-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-surface-sunken"
			>
				Open in behavior editor <Icon name="cpu" size={12} />
			</button>
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					title="Open in a dedicated tab"
					class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-brand-600"
				>
					<Icon name="external-link" size={12} />
				</a>
			{/if}
		</div>
	</li>
{/snippet}

<div>
	<p class="mb-5 max-w-2xl text-sm text-ink-500">
		A read-only overview of this project's behavior (surfaces, actions, rules, invariants,
		effects, scenarios, events and more), folded from the canonical behavior model. Author and edit behavior in the behavior editor; this
		reflects it and links straight to the right place.
	</p>

	{#if !hasBehavior}
		<!-- Honest empty state — no sample data, no false save badge. -->
		<div class="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
			<span class="grid size-12 place-items-center rounded-full bg-surface-sunken text-brand-500">
				<Icon name="cpu" size={22} />
			</span>
			<p class="text-base font-semibold text-ink-800">No behavior authored yet</p>
			<p class="max-w-md text-sm text-ink-500">
				Behavior comes from your Features (each leaf) and Experience (journeys and screens). Add
				those first, then author detailed surfaces, actions and scenarios in the behavior editor.
			</p>
			<div class="mt-1 flex items-center gap-2">
				<button
					type="button"
					onclick={() => onOpenEditor()}
					class="inline-flex items-center gap-1 rounded-field bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600"
				>
					Open behavior editor <Icon name="cpu" size={13} />
				</button>
				{#if projectHref}
					<a
						href={projectHref}
						target="_blank"
						rel="noopener noreferrer"
						title="Open in a dedicated tab"
						class="inline-flex items-center rounded-field border border-line bg-surface p-2 text-ink-400 hover:bg-surface-sunken hover:text-brand-600"
					>
						<Icon name="external-link" size={13} />
					</a>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Real project totals. -->
		<div class="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
			{#each stats as s (s.label)}
				<div class="rounded-card border border-line bg-surface px-3 py-2.5" title={'hint' in s ? s.hint : undefined}>
					<p class="text-2xl font-bold tabular-nums text-ink-900">{s.value}</p>
					<p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">{s.label}</p>
				</div>
			{/each}
		</div>

		<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
			{#if overview.attention.unauthored > 0 || overview.attention.overCap > 0}
				<p class="flex items-center gap-2 text-xs text-ink-500">
					<Icon name="info" size={13} />
					{#if overview.attention.unauthored > 0}
						<span>{overview.attention.unauthored} feature(s) with no behavior yet.</span>
					{/if}
					{#if overview.attention.overCap > 0}
						<span>{overview.attention.overCap} feature(s) past the size cap - consider splitting.</span>
					{/if}
				</p>
			{:else}
				<span></span>
			{/if}
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => onOpenEditor()}
					class="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
				>
					Open project in behavior editor <Icon name="cpu" size={12} />
				</button>
				{#if projectHref}
					<a
						href={projectHref}
						target="_blank"
						rel="noopener noreferrer"
						title="Open in a dedicated tab"
						class="inline-flex items-center text-ink-400 hover:text-brand-600"
					>
						<Icon name="external-link" size={12} />
					</a>
				{/if}
			</div>
		</div>

		<!-- Behavior grouped by release, so each section reads as "what this release
		     delivers" rather than one flat list of every feature. -->
		{#each releaseGroups as g (g.rel.id)}
			<section class="mb-5 rounded-card border border-line bg-surface">
				<header class="flex items-center gap-2 border-b border-line px-4 py-2.5">
					<span class="rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">
						{g.rel.version}
					</span>
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{g.rel.name || 'Untitled release'}
					</span>
					<span class="ml-auto text-[10px] text-ink-400">
						{g.features.length} feature{g.features.length === 1 ? '' : 's'}
					</span>
				</header>
				<ul class="divide-y divide-line">
					{#each g.features as f (f.featureId)}
						{@render featureRow(f, false)}
					{/each}
				</ul>
			</section>
		{/each}

		{#if unscheduledFeatures.length > 0}
			<section class="mb-5 rounded-card border border-line bg-surface">
				<header class="border-b border-line px-4 py-2.5">
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{releaseGroups.length > 0 ? 'Unscheduled' : 'Feature behavior'}
					</span>
					{#if releaseGroups.length > 0}
						<span class="ml-1 text-[10px] text-ink-400">- not in any release</span>
					{/if}
				</header>
				<ul class="divide-y divide-line">
					{#each unscheduledFeatures as f (f.featureId)}
						{@render featureRow(f, false)}
					{/each}
				</ul>
			</section>
		{/if}

		{#if overview.shared.length > 0}
			<section class="rounded-card border border-line bg-surface">
				<header class="border-b border-line px-4 py-2.5">
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						Shared behavior
					</span>
					<span class="ml-1 text-[10px] text-ink-400">- data model & experience, used across features</span>
				</header>
				<ul class="divide-y divide-line">
					{#each overview.shared as f (f.featureId)}
						{@render featureRow(f, true)}
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
