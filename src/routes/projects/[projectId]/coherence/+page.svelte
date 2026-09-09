<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { goto } from '$app/navigation';
	import { CoherenceStore } from '$ui/coherence/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import { MATURITY_DIMENSION_KEY } from '$domain/coherence';
	import { Card, HelpTip, MATURITY_STAGE_COUNT, stageFromScore, stageLabel } from '$ui/design-system';
	import { SCORE_HELP, READINESS_VS_COHERENCE } from '$ui/coherence/help';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import ReadingSelector from '$ui/coherence/sections/ReadingSelector.svelte';
	import CoverageDetail from '$ui/coherence/sections/CoverageDetail.svelte';
	import CoherenceDetail from '$ui/coherence/sections/CoherenceDetail.svelte';
	import BuildReadinessDetail from '$ui/coherence/sections/BuildReadinessDetail.svelte';
	import BehaviorMaturityDetail from '$ui/coherence/sections/ReadinessDetail.svelte';
	import GuaranteeTiers from '$ui/coherence/sections/GuaranteeTiers.svelte';
	import ThresholdControl from '$ui/coherence/sections/ThresholdControl.svelte';
	import GeneratePanel from '$ui/coherence/sections/GeneratePanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(
		() =>
			new CoherenceStore(
				data.draft,
				data.analysis,
				data.session,
				toastNotifier,
				data.revision
			)
	);

	// Live-sync: re-hydrate the draft AND the server-recomputed analysis
	// (dimensions / gap cards) when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
		store.analysis = data.analysis;
	});

	const projectName = $derived(data.productName);

	// Which of the four distinct readings is in focus. Build Readiness (the gate) leads.
	type Reading = 'coverage' | 'coherence' | 'readiness' | 'maturity';
	let reading = $state<Reading>('readiness');

	/* ── Four readings — all client-derived from store/analysis ───────────────
	   Coverage = breadth (structural dimensions only, maturity axis excluded),
	   Coherence = correctness, Readiness = the build gate, Maturity = the spec
	   maturity stage. Each carries a tag and a one-line hint; the selector
	   renders the shared verdict ladder from `score`. */
	const structuralDims = $derived(
		store.analysis.dimensions.filter((d) => d.key !== MATURITY_DIMENSION_KEY)
	);
	// Breadth = mean structural dimension score, excluding the behavior-maturity axis.
	const coverageScore = $derived(
		structuralDims.length
			? Math.round(structuralDims.reduce((s, d) => s + d.score, 0) / structuralDims.length)
			: 0
	);
	const behaviorMaturity = $derived(
		store.analysis.dimensions.find((dimension) => dimension.key === MATURITY_DIMENSION_KEY)?.score ?? 0
	);

	const kpis = $derived([
		{
			key: 'coverage' as const,
			label: 'Coverage',
			tag: 'Presence & completeness',
			hint: 'Expected elements are present and connected.',
			score: coverageScore,
			help: SCORE_HELP.coverage
		},
		{
			key: 'coherence' as const,
			label: 'Coherence',
			tag: 'Coherence',
			hint:
				store.gaps.length === 0
					? 'No contradiction detected.'
					: `${store.gaps.length} issue${store.gaps.length > 1 ? 's' : ''} to resolve.`,
			score: store.coherenceScore,
			help: SCORE_HELP.coherence
		},
		{
			key: 'readiness' as const,
			label: 'Build readiness',
			tag: 'Implementation gate',
			hint: `Enough coverage and behavior to build? Threshold ${store.draft.threshold}%.`,
			score: store.readiness,
			help: SCORE_HELP.readiness
		},
		{
			key: 'maturity' as const,
			label: 'Behavior maturity',
			tag: 'Spec maturity stage',
			hint: `Behavior depth: ${stageLabel(stageFromScore(behaviorMaturity))} (${stageFromScore(behaviorMaturity)}/${MATURITY_STAGE_COUNT}).`,
			score: behaviorMaturity,
			help: SCORE_HELP.maturity
		}
	]);

	// Fallback deep-link anchors per source step — the destination step scrolls +
	// flashes to the named region. Only steps with a stable anchor target are
	// mapped; a gap's own fixAnchor always wins when present. `permissions` is its
	// own page, so it keeps that route and jumps to the access matrix.
	const SOURCE_STEP_ANCHOR: Record<string, string> = {
		foundation: '?tab=business#business-objective',
		// Stored pre-fold gaps may still say `framing`; the legacy route 308s home.
		framing: '#business-objective',
		features: '#feature-tree',
		users: '?tab=permissions#access-matrix',
		permissions: '#access-matrix'
	};

	function openGap(gap: { sourceStep: string; fixAnchor?: string }) {
		const mapped = SOURCE_STEP_ANCHOR[gap.sourceStep];
		void goto(
			`/projects/${store.draft.projectId}/${gap.sourceStep}${gap.fixAnchor ?? mapped ?? ''}`
		);
	}
</script>

<svelte:head>
	<title>{projectName} · Project health · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<PageHeading
			eyebrow="Project health"
			title="Is the project ready and coherent?"
			description="Four readings of the spec: structural Coverage, correctness through Coherence, the composite Build Readiness gate and Behavior Maturity in named stages. Select a score to inspect it and trace each required fix."
			help={CAPABILITY_HELP.coherence}
			class="mb-7"
		/>

		<div class="space-y-6 pb-4">
			<!-- Four distinct readings — pick which one to drill into below. -->
			<ReadingSelector
				{kpis}
				active={reading}
				onSelect={(k) => (reading = k as Reading)}
			/>

			<!-- Prominent, always-visible explainer: strong Build Readiness and critical
			     Coherence are independent, not a contradiction. Local coherence sits
			     behind a "?" since it's a per-step concept, not a reading here. -->
			<div class="flex items-start gap-2 rounded-card border border-line bg-surface-sunken/60 px-4 py-2.5 text-xs text-ink-500">
				<span class="flex-1 leading-relaxed">
					<span class="font-semibold text-ink-700">Build Readiness and Coherence are independent.</span>
					A spec can contain enough detail to build (strong <span class="font-medium text-ink-600">Build Readiness</span>)
					while still holding unresolved contradictions (critical
					<span class="font-medium text-ink-600">Coherence</span>) - coverage and depth raise Readiness,
					disagreements lower Coherence. Resolve critical Coherence issues before you generate.
				</span>
				<span class="mt-0.5 flex shrink-0 items-center gap-1">
					<HelpTip {...READINESS_VS_COHERENCE} />
					<HelpTip {...SCORE_HELP.localCoherence} label="What local coherence means" />
				</span>
			</div>

			<!-- The selected reading's detail. -->
			<Card class="p-4" padding={false}>
				{#if reading === 'coverage'}
					<CoverageDetail {store} onOpenGap={openGap} />
				{:else if reading === 'coherence'}
					<CoherenceDetail {store} onOpenGap={openGap} />
				{:else if reading === 'readiness'}
					<BuildReadinessDetail {store} />
				{:else}
					<BehaviorMaturityDetail {store} featureMaturity={data.featureMaturity} />
				{/if}
			</Card>

			<!-- Platform gate: guarantees, the green-bar threshold and the spec generator. -->
			<section class="space-y-5 border-t border-line pt-6">
				<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">Generate specs</p>
				<div class="grid gap-5 lg:grid-cols-[1fr_minmax(260px,360px)]">
					<GuaranteeTiers {store} productTier={data.tier} />
					<ThresholdControl {store} />
				</div>
				<GeneratePanel {store} />
			</section>

			<!-- Where to simulate before a change, and where fixes get traced. -->
			<p class="text-center text-[11px] text-ink-400">
				For impact simulation before a change, open the
				<span class="font-semibold text-ink-500">Control Center</span> (top bar). Every fix is
				logged in AI Governance, Traceability.
			</p>
		</div>
	</div>
</div>

<SaveBar saveStatus={store.saveStatus} coherence={store.coherence} />
