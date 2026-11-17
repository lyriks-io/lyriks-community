<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import Gauge from '$ui/design-system/Gauge.svelte';
	import { clickedWithin, floatInView } from '$ui/design-system';
	import { untrack } from 'svelte';
	import {
		Icon,
		MATURITY_STAGES,
		MATURITY_STAGE_COUNT,
		stageFromScore,
		clampStageLevel,
		stageLabel
	} from '$ui/design-system';
	import {
		planNextStage,
		MVP_TIERS,
		type LeafMeta
	} from '$domain/features';
	import type { FeatureAdvice, FeatureAssessment } from '$application/use-cases';
	import { proofScope, splitGaps, type ProvenFinding } from '$application/analysis/proven-findings';
	import { getSpecLanguage } from '$ui/language/spec-language-context';
	import type {
		BehaviorAcceptanceCriterion,
		BehaviorFeatureSummary
	} from '$application/specification/summarize-behavior';
	import { ACCEPTANCE_EDGE_PREFIX, ACCEPTANCE_LEAF_PREFIX } from '$application/projection/ownership';
	import EdgeCaseCard from '$ui/rules/EdgeCaseCard.svelte';
	import type { RulesStore } from '$ui/rules/draft-store.svelte';
	import type { FeatureMaturityIssue, FeatureMaturityReport, SpecGap } from '$application/ports';
	import type { WorkTarget } from '$domain/features';
	import { readableName, sortByName } from '$domain/features';
	import type { FeatureAction } from '$application/specification/index-feature-actions';
	import PanelControls from '../PanelControls.svelte';
	import DigestSummary from '../DigestSummary.svelte';
	import type { Collaborator } from '$domain/team';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { FeaturesStore } from '../draft-store.svelte';
	import MvpChip from '../MvpChip.svelte';
	import ReleaseChip from '../ReleaseChip.svelte';
	import AssigneeChip from '../AssigneeChip.svelte';
	import ContributorPicker from '../ContributorPicker.svelte';
	import { unspaActionPath, unspaFeaturePath } from '../unspa-dashboard-url';
	import { describeDependants, fetchDependants, type DependantsReading } from '$ui/graph/dependants';
	import { digestBody } from '../digest-body';

	interface Props {
		store: FeaturesStore;
		advice: FeatureAdvice[];
		/**
		 * Per-feature counts folded server-side from the behavior snapshots at page
		 * load. Local, engine-free and already in hand when the drawer opens, so the
		 * model line never waits on (nor lies while waiting for) the advisor.
		 */
		localSummaries?: readonly BehaviorFeatureSummary[];
		/** Team members this feature can be assigned to. */
		collaborators: Collaborator[];
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor?: (path?: string | null) => void;
		/** The rules section, where Given / When / Then criteria are stored. */
		rulesStore?: RulesStore;
		/** False for a viewer: the card is read, never completed. */
		canEdit?: boolean;
		/**
		 * Narrow (why the feature exists) or wide (everything, product beside
		 * engine). Owned by the drawer, which sizes itself from it.
		 */
		expanded?: boolean;
		onExpandedChange?: (expanded: boolean) => void;
		/** The feature's own actions, each opening its details in this drawer. */
		actions?: readonly FeatureAction[];
		onOpenAction?: (actionId: string) => void;
	}
	let {
		store,
		advice,
		localSummaries = [],
		collaborators,
		onOpenEditor,
		rulesStore,
		canEdit = true,
		expanded = false,
		onExpandedChange,
		actions = [],
		onOpenAction
	}: Props = $props();

	const leaf = $derived(
		store.draft.features.find((f) => f.id === store.selectedFeatureId) ?? null
	);
	const adviceByFeature = $derived(new Map(advice.map((a) => [a.featureId, a])));
	const leafAdvice = $derived(leaf ? (adviceByFeature.get(leaf.id) ?? null) : null);
	const summary = $derived(leafAdvice?.summary ?? null);
	const score = $derived(leafAdvice?.score ?? null);
	const gaps = $derived(leafAdvice?.gaps ?? []);

	const coreOf = $derived(leaf ? store.draft.cores.find((c) => c.id === leaf.coreId) ?? null : null);

	const mvpTier = $derived(leaf ? store.getMvpTier(leaf.id) : null);
	const releaseId = $derived(leaf ? store.getReleaseAssignment(leaf.id) : null);

	// ── In-app authoring (W7) — always-available structured metadata driven by
	// the leafMeta seam (persists through the Lyriks features residue, not the
	// kernel). Works fully offline / without the Unspa dashboard.
	const meta = $derived<LeafMeta>(leaf ? store.getLeafMeta(leaf.id) : {});
	const filled = (v: string | undefined) => !!v && v.trim().length > 0;
	// One consolidated Feature card: problem → solution → value. `What it does` is
	// backed by the kernel `description`, falling back to the legacy `objective`
	// residue so anything authored there survives that field leaving the UI.
	const whatItDoes = $derived<string>(leaf?.description || meta.objective || '');
	const cardFilled = $derived(
		[meta.problem, whatItDoes, meta.expectedEffect, meta.value].filter(filled).length
	);
	// The narrow view shows only what is already said. Which fields it shows is
	// fixed when the feature opens, not re-read on every keystroke, so clearing a
	// field while rewriting it does not make it vanish under the cursor.
	type CardField = 'problem' | 'solution' | 'effect' | 'value';
	let shownCardFields = $state<ReadonlySet<CardField>>(new Set());
	$effect(() => {
		if (!leaf) return;
		const said = untrack(() => ({
			problem: meta.problem,
			solution: whatItDoes,
			effect: meta.expectedEffect,
			value: meta.value
		}));
		shownCardFields = new Set(
			(Object.keys(said) as CardField[]).filter((field) => filled(said[field]))
		);
	});
	const cardComplete = $derived(shownCardFields.size === 4);
	function completeCard(): void {
		shownCardFields = new Set<CardField>(['problem', 'solution', 'effect', 'value']);
	}
	const cardFieldShown = (field: CardField) => expanded || shownCardFields.has(field);

	// The header menu holds the one destructive action, out of the way in both views.
	let menuOpen = $state(false);
	let menuRoot = $state<HTMLElement>();
	let menuPanel = $state<HTMLElement>();
	function onWindowClick(e: MouseEvent): void {
		if (menuOpen && !clickedWithin(e.target, menuRoot, menuPanel)) menuOpen = false;
	}
	async function reveal(anchorId: string): Promise<void> {
		onExpandedChange?.(true);
		// Wait for the wide layout to render the block before scrolling to it.
		await Promise.resolve();
		requestAnimationFrame(() =>
			document.getElementById(anchorId)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' })
		);
	}

	// Requirements-backbone metadata (Next scope): acceptance criteria, dependencies
	// on other leaves, and a source link. All ride the same leafMeta residue seam.
	// ONE list of acceptance criteria: the model's. It holds the rows this panel
	// authored (projected under a reserved prefix, so they carry `wizardId` back) and
	// the rows an AI client wrote through the MCP, which carry a status and relations
	// and used to be displayed nowhere. The panel's own edits are layered back on top
	// live, because the model list is only refreshed when the section is saved: a row
	// being typed must not show its last saved wording, a row just added must appear,
	// and a row just deleted must go.
	const acceptance = $derived.by((): BehaviorAcceptanceCriterion[] => {
		const pending = new Map((meta.acceptanceCriteria ?? []).map((c) => [c.id, c.text]));
		const rows: BehaviorAcceptanceCriterion[] = [];
		for (const criterion of localSummary?.acceptanceCriteria ?? []) {
			// Given / When / Then criteria are read live from the rules section below,
			// not from the model's copy, which only refreshes on save.
			if (rulesStore && criterion.id.startsWith(ACCEPTANCE_EDGE_PREFIX)) continue;
			if (criterion.wizardId === undefined) {
				rows.push(criterion);
				continue;
			}
			if (!pending.has(criterion.wizardId)) continue; // deleted here, not saved yet
			rows.push({ ...criterion, title: pending.get(criterion.wizardId) ?? '' });
			pending.delete(criterion.wizardId);
		}
		for (const [id, text] of pending) {
			rows.push({ id: `${ACCEPTANCE_LEAF_PREFIX}${id}`, title: text, supersededBy: [], wizardId: id });
		}
		return rows;
	});
	// The feature's Given / When / Then criteria, edited in place below.
	const structured = $derived(
		rulesStore && leaf ? rulesStore.draft.scenarios.filter((c) => c.relatedFeatureId === leaf.id) : []
	);
	const criterionCount = $derived(acceptance.length + structured.length);
	const caseFeatures = $derived(store.draft.features.map((f) => ({ id: f.id, name: f.name })));
	const deps = $derived(meta.dependsOn ?? []);
	const sourceIds = $derived(meta.sourceIds ?? []);
	const otherLeaves = $derived(leaf ? store.draft.features.filter((f) => f.id !== leaf.id) : []);
	const featureName = (id: string) => store.draft.features.find((f) => f.id === id)?.name ?? id;

	// ── Delete impact preview (W8) — an in-app confirmation (replaces confirm())
	// that first enumerates the feature's downstream ties (priority + release).
	let confirmingDelete = $state(false);
	const deletePriorityLabel = $derived(
		mvpTier ? (MVP_TIERS.find((t) => t.code === mvpTier)?.label ?? mvpTier) : null
	);
	const deleteRelease = $derived(
		releaseId ? (store.draft.releases.find((r) => r.id === releaseId) ?? null) : null
	);
	const deleteReleaseName = $derived(
		deleteRelease ? deleteRelease.name || deleteRelease.version || 'Untitled release' : null
	);
	// What rests on the leaf, read from the knowledge graph the moment the
	// deletion is asked for: screens, journeys, rights, rules, scenarios. The
	// delete control stays disabled until the reading is in, so nothing goes
	// blind; a graph that cannot be read is said so, not passed off as "nothing".
	let deleteDependants = $state<DependantsReading | null>(null);
	let deleteDependantsFailed = $state(false);
	const deleteWeighed = $derived(deleteDependants !== null || deleteDependantsFailed);
	$effect(() => {
		deleteDependants = null;
		deleteDependantsFailed = false;
		if (!confirmingDelete || !leaf) return;
		const focus = `feature:${leaf.id}`;
		let cancelled = false;
		fetchDependants(store.draft.projectId, focus)
			.then((reading) => {
				if (!cancelled) deleteDependants = reading;
			})
			.catch(() => {
				if (!cancelled) deleteDependantsFailed = true;
			});
		return () => {
			cancelled = true;
		};
	});
	// The local scoring of this feature's shell. NOT part of the engine assessment
	// below: it is read straight from the model, so it answers with the advisor
	// offline and lands in milliseconds. Declared here because the readiness chip
	// falls back to it.
	let maturity = $state<FeatureMaturityReport | null>(null);
	let maturityLoading = $state(false);

	// Spec maturity as a stage: a stage set by hand wins over the
	// engine maturity score. Null only when neither exists yet (feature the
	// engine can't read).
	const manualStage = $derived(leaf ? (store.getLeafMeta(leaf.id).stage ?? null) : null);
	// Falls back to the local maturity read while the cached advisor is still
	// refreshing, exactly like the tree's badge does. Without it the chip sat
	// unscored for seconds next to a maturity card already naming the stage.
	const effectiveStage = $derived<number | null>(
		manualStage != null
			? clampStageLevel(manualStage)
			: score
				? stageFromScore(score.percentage)
				: maturity
					? stageFromScore(maturity.percentage)
					: null
	);
	// Early stage = shallow spec (red), top stages = deeply specified (green).
	function stageChipTone(l: number): string {
		if (l >= 4) return 'bg-success-50 text-success-600';
		if (l >= 2) return 'bg-warning-50 text-warning-600';
		return 'bg-danger-50 text-danger-500';
	}

	// Engine cap signal (the mockup's gate): a feature should stay under 15 surfaces /
	// 100 actions to remain coherent in Unspaghettit. Counts come from the summary.

	// Full Unspaghettit assessment (named behavior + executable scenarios +
	// model-check reachability + spec gaps + gated verdict), fetched on demand
	// when the drawer opens. Authoring stays in Unspa; this is the read-only
	// source-of-truth readout. Cleanup drops a stale response on leaf switch.
	let assessment = $state<FeatureAssessment | null>(null);
	let behaviorLoading = $state(false);
	/** The solver's first pass is shown; the rounds that settle what it left open are still running. */
	let settlingMore = $state(false);
	// What stands between this feature and its next maturity stage. The engine's
	// own checks, projected through the SAME ladder the badge above uses, so the
	// number stops being a thermometer and becomes a to-do list. Null while the
	// shell has not been read (or does not exist yet).
	const stagePlan = $derived(maturity ? planNextStage(maturity, stageFromScore) : null);
	// A hand-set stage wins in the chip but never changes what the engine
	// measures, so the card says which stage it is planning towards when the
	// two disagree.
	const stageIsManual = $derived(manualStage !== null);

	// Jump from a check to the thing it is about: the behavior editor, opened in
	// place on that action (or its surface). Authoring lives there; the drawer
	// only reads the model.
	function revealCheck(issue: FeatureMaturityIssue): void {
		if (!leaf || !onOpenEditor) return;
		const featureId = leaf.unspaghettitFeatureId;
		const path =
			issue.surfaceId && issue.actionId
				? unspaActionPath(featureId, issue.surfaceId, issue.actionId)
				: issue.surfaceId
					? `${unspaFeaturePath(featureId)}?surface=${encodeURIComponent(issue.surfaceId)}`
					: unspaFeaturePath(featureId);
		onOpenEditor(path);
	}

	const behavior = $derived(assessment?.behavior ?? null);
	// Counts, freshest source first: this drawer's own engine read (updated after
	// an inline write), then the local fold from page load, then the cached
	// advisor. The advisor used to be the only source, so a cold cache made the
	// line state a confident "0 Surfaces" for a feature that has some, and the
	// real numbers only landed when the slow engine call returned.
	const localSummary = $derived(
		leaf ? (localSummaries.find((s) => s.featureId === leaf.id) ?? null) : null
	);
	// A feature is deleted from the bottom up: while it holds actions, delete them first.
	const holdsActions = $derived((localSummary?.actionCount ?? 0) > 0);
	const surfaceCount = $derived(
		behavior?.surfaces.length ?? localSummary?.surfaceCount ?? summary?.surfaceCount ?? 0
	);
	const actionCount = $derived(
		behavior?.actions.length ?? localSummary?.actionCount ?? summary?.actionCount ?? 0
	);
	const stateCount = $derived(localSummary?.stateCount ?? summary?.stateCount ?? 0);
	const withinCap = $derived(surfaceCount <= 15 && actionCount <= 100);
	const scenarios = $derived(assessment?.scenarios ?? null);
	const modelCheck = $derived(assessment?.modelCheck ?? null);
	const specGaps = $derived(assessment?.specGaps ?? []);
	// How far the solver's proof went, apart from the gaps: a statement with no
	// path within the bound is not proven, and must not read as nothing at all.
	// The solver's findings, written as the requirements they break (server side).
	const findings = $derived(assessment?.provenFindings ?? []);
	const gapSplit = $derived(splitGaps(specGaps, assessment?.proof ?? null));
	// The solver's scope reads in the language of the spec, like the findings.
	const specLanguage = getSpecLanguage();
	const scope = $derived(proofScope(assessment?.proof ?? null, specLanguage()));
	// Counted from the solver's findings; from the exploration only when the solver did not run.
	const blockingCount = $derived(
		assessment?.proof?.solver === 'ran'
			? findings.filter((f) => f.tone === 'blocking').length
			: modelCheck
				? modelCheck.invariantViolations.length
				: null
	);
	const warningCount = $derived(
		assessment?.proof?.solver === 'ran' ? findings.filter((f) => f.tone === 'warning').length : null
	);
	const verdict = $derived(assessment?.verdict ?? null);
	// Implementation coverage tally (null when unreachable / empty shell). The
	// per-action "what it does" digest is now mutualised into the Surfaces &
	// actions accordion, so it is no longer rendered here.
	const implementation = $derived(assessment?.implementation ?? null);
	// The engine's own plain-language account of what this feature does, derived
	// deterministically from the model (never generated prose). Its preamble
	// repeats the drawer header, so only the body is rendered.
	const digest = $derived(assessment?.digest ?? null);
	const digestMarkdown = $derived(
		digest?.hasContent
			? digestBody(digest.markdown, leaf?.name ?? '', leaf?.description ?? '')
			: ''
	);
	const GAP_CAP = 8; // keep the drawer scannable; the rest collapse behind a count
	const hasEngineSignal = $derived(
		!!assessment?.available && (!!scenarios || !!modelCheck || !!verdict)
	);
	$effect(() => {
		const id = leaf?.id ?? null;
		assessment = null;
		confirmingDelete = false; // never carry a pending delete across leaf switches
		menuOpen = false;
		if (!id) return;
		let cancelled = false;
		behaviorLoading = true;
		settlingMore = false;
		const read = (complete: boolean) =>
			fetch(
				`/api/features/behavior?projectId=${encodeURIComponent(store.draft.projectId)}&featureId=${encodeURIComponent(id)}${complete ? '&complete=1' : ''}`
			)
				.then((r) => (r.ok ? r.json() : null))
				.then((body) => (body?.assessment as FeatureAssessment | null) ?? null);
		// The solver's first pass first, shown at once; then, when it says more
		// may be settled, the full proof, which starts from that first pass.
		read(false)
			.then((first) => {
				if (cancelled) return;
				assessment = first;
				behaviorLoading = false;
				if (!first?.proof?.moreToCome) return;
				settlingMore = true;
				return read(true).then((full) => {
					if (!cancelled && full) assessment = full;
				});
			})
			.catch(() => {
				if (!cancelled && !assessment) assessment = null;
			})
			.finally(() => {
				if (cancelled) return;
				behaviorLoading = false;
				settlingMore = false;
			});
		return () => {
			cancelled = true;
		};
	});

	// The maturity reading has its own round trip on purpose: the assessment above
	// waits on the engine (seconds on a rich feature, unavailable when it is off),
	// while this one is a local scoring of the shell and must land right away.
	$effect(() => {
		const id = leaf?.id ?? null;
		maturity = null;
		if (!id) return;
		let cancelled = false;
		maturityLoading = true;
		fetch(
			`/api/features/maturity?projectId=${encodeURIComponent(store.draft.projectId)}&featureId=${encodeURIComponent(id)}`
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (!cancelled) maturity = (body?.maturity as FeatureMaturityReport | null) ?? null;
			})
			.catch(() => {
				if (!cancelled) maturity = null;
			})
			.finally(() => {
				if (!cancelled) maturityLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:window onclick={onWindowClick} />

{#if !leaf}
	<div
		class="grid h-full min-h-80 place-items-center rounded-card border border-dashed border-line bg-surface p-8 text-center"
	>
		<div class="max-w-xs space-y-2">
			<span class="mx-auto grid size-10 place-items-center rounded-xl bg-surface-sunken text-ink-400">
				<Icon name="sparkles" size={18} />
			</span>
			<p class="text-sm font-semibold text-ink-700">Select a leaf feature</p>
			<p class="text-xs text-ink-400">
				Click any feature in the tree to open its details - intent, requirements and its
				behavior model.
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-4">
		<!-- ── Header: names the feature, its editor and the menu ── -->
		<div class="flex items-start gap-3">
			<span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
				<Icon name="grid" size={16} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-brand-600">
					<span>Feature{coreOf?.name ? ` · ${coreOf.name}` : ''}</span>
					<!-- The engine read behind this drawer takes seconds on a modelled
					     feature. Only the wide view shows what it feeds, so the signal
					     is only raised there. -->
					{#if expanded && behaviorLoading}
						<span
							class="flex items-center gap-1 font-medium normal-case tracking-normal text-ink-400"
							aria-live="polite"
						>
							<span class="size-1.5 animate-pulse bg-ink-400"></span>
							Reading the model…
						</span>
					{:else if settlingMore}
						<span
							class="flex items-center gap-1 font-medium normal-case tracking-normal text-ink-400"
							aria-live="polite"
							title="The solver's first pass is shown; it is asking again what that pass left open, and the verification below updates when it answers."
						>
							<span class="size-1.5 animate-pulse bg-brand-400"></span>
							Settling what the solver left open…
						</span>
					{/if}
				</p>
				<input
					id="leaf-name"
					type="text"
					value={leaf.name}
					oninput={(e) => store.updateFeature(leaf.id, 'name', e.currentTarget.value)}
					placeholder="Feature name"
					aria-label="Feature name"
					class="mt-0.5 w-full rounded-sm border-b border-transparent bg-transparent text-lg font-bold leading-tight text-ink-900 outline-none placeholder:text-ink-300 hover:border-line focus:border-brand-300"
				/>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-1">
				<span class="inline-flex items-center gap-1">
					<div bind:this={menuRoot} class="relative">
						<button
							type="button"
							onclick={() => (menuOpen = !menuOpen)}
							class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
							aria-label="More actions on this feature"
							aria-expanded={menuOpen}
						>
							<Icon name="ellipsis" size={13} />
						</button>
						{#if menuOpen}
							<div bind:this={menuPanel} use:floatInView={{ anchor: menuRoot, align: 'right' }}
								class="min-w-44 rounded-lg border border-line bg-surface py-1 shadow-xl"
							>
								{#if holdsActions}
									<span
										class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] text-ink-400"
										title="Delete its actions first"
									>
										<Icon name="lock" size={12} /> Delete its actions first
									</span>
								{:else}
									<button
										type="button"
										disabled={!canEdit}
										onclick={() => {
											menuOpen = false;
											confirmingDelete = true;
										}}
										class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] text-danger-500 hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
									>
										<Icon name="x" size={12} /> Delete feature
									</button>
								{/if}
							</div>
						{/if}
					</div>
					<PanelControls
						{expanded}
						onCollapse={() => onExpandedChange?.(false)}
						onClose={() => store.selectFeature(null)}
					/>
				</span>
				{#if !withinCap}
					<span class="text-[0.625rem] font-medium text-danger-500">Over cap - split first.</span>
				{/if}
			</div>
		</div>

		<!-- ── Where the feature is going: priority, release, owner (one line) ── -->
		<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Priority, release and owner">
			<span title="Priority">
				<MvpChip
					tier={mvpTier}
					onPick={(t) => (t ? store.setMvpTier(leaf.id, t) : store.clearMvpTier(leaf.id))}
				/>
			</span>
			<span title="Release">
				<ReleaseChip
					{releaseId}
					releases={store.draft.releases}
					onPick={(id) =>
						id ? store.assignFeatureToRelease(leaf.id, id) : store.unassignFeatureFromRelease(leaf.id)}
				/>
			</span>
			<span title="Owner">
				<AssigneeChip
					assigneeId={store.getAssignment({ kind: 'feature', featureId: leaf.id })?.assigneeId ?? null}
					{collaborators}
					onPick={(id) => store.assignWorkItem({ kind: 'feature', featureId: leaf.id } as WorkTarget, id)}
				/>
			</span>
			<!-- Naming contributors means naming someone else: not offered to a team of one. -->
			{#if collaborators.length > 1}
				<span title="Contributors">
					<ContributorPicker
						selectedIds={store.getFeatureContributors(leaf.id)}
						people={collaborators}
						onToggle={(personId) => store.toggleFeatureContributor(leaf.id, personId)}
					/>
				</span>
			{/if}
		</div>

		{#if expanded}
			<!-- ── Wide view: the product on the left, what the engine reads on the right ── -->
			<div class="grid gap-4 lg:grid-cols-2">
				<div class="min-w-0 space-y-4">
					<!-- ── Feature card (one place · problem → solution → value) ────────── -->
					<div class="space-y-3 rounded-field border border-line bg-surface-sunken/40 p-3">
						<div
							class="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
						>
							<Icon name="grid" size={12} class="text-brand-500" /> Feature card
							<span class="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-300">
								· problem, solution, value
							</span>
							<span
								class="ml-auto rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tabular-nums normal-case tracking-normal {cardFilled >
								0
									? 'bg-success-50 text-success-600'
									: 'bg-surface-sunken text-ink-400'}"
							>
								{cardFilled}/4
							</span>
						</div>
						{#if cardFieldShown('problem')}
						<div>
							<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-problem">
								Problem
								<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· why this exists</span>
							</label>
							<textarea
								id="leaf-problem"
								value={meta.problem ?? ''}
								oninput={(e) => store.updateLeafMeta(leaf.id, { problem: e.currentTarget.value })}
								rows="2"
								placeholder="e.g. Customers can't pay overdue invoices without calling support."
								class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						{/if}
						{#if cardFieldShown('solution')}
						<div>
							<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-desc">
								What it does
								<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· the solution</span>
							</label>
							<textarea
								id="leaf-desc"
								value={whatItDoes}
								oninput={(e) => store.updateFeature(leaf.id, 'description', e.currentTarget.value)}
								rows="2"
								placeholder="e.g. Let a customer settle an overdue invoice in one click."
								class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						{/if}
						{#if cardFieldShown('effect')}
						<div>
							<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-effect">
								Expected effect
								<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· measurable outcome</span>
							</label>
							<textarea
								id="leaf-effect"
								value={meta.expectedEffect ?? ''}
								oninput={(e) => store.updateLeafMeta(leaf.id, { expectedEffect: e.currentTarget.value })}
								rows="2"
								placeholder="e.g. Cuts dunning follow-ups by ~30% and shortens time-to-cash."
								class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						{/if}
						{#if cardFieldShown('value')}
						<div>
							<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-value">
								Value
								<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· qualitative benefit</span>
							</label>
							<textarea
								id="leaf-value"
								value={meta.value ?? ''}
								oninput={(e) => store.updateLeafMeta(leaf.id, { value: e.currentTarget.value })}
								rows="2"
								placeholder="e.g. Faster cash collection and fewer support tickets."
								class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
							></textarea>
						</div>
						{/if}
					</div>

					<!-- ── Actions: what a user can do in this feature, each opening its details ── -->
					{#if actions.length > 0}
						<div id="leaf-actions" class="scroll-mt-4 rounded-field border border-line bg-surface-sunken/40 p-3">
							<p class="mb-2 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
								<Icon name="bolt" size={12} class="text-brand-500" /> Actions
							</p>
							<ul class="space-y-0.5">
								{#each sortByName(actions, (a) => readableName(a.name)) as action (action.id)}
									<li>
										<button
											type="button"
											onclick={() => onOpenAction?.(action.id)}
											class="group/action flex w-full items-center gap-2 rounded-field px-2 py-1 text-left hover:bg-surface"
										>
											<!-- Reads as a link, so the reader knows it opens (spec: criterion f104bde6). -->
											<span
												class="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-brand-600 underline-offset-2 group-hover/action:text-brand-700 group-hover/action:underline"
												>{readableName(action.name)}</span
											>
											<Icon name="arrow-right" size={11} class="shrink-0 text-ink-300 group-hover/action:text-brand-600" />
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- ── Acceptance criteria (in-app authoring · testable requirements) ── -->
					<details
						id="leaf-acceptance"
						class="scroll-mt-4 rounded-field border border-line bg-surface-sunken/40 p-3"
						data-anchor="acceptance-criteria"
						open={criterionCount > 0}
					>
						<summary
							class="flex cursor-pointer list-none items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
						>
							<Icon name="check" size={12} class="text-brand-500" /> Acceptance criteria
							<span
								class="ml-auto rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tabular-nums normal-case tracking-normal {criterionCount >
								0
									? 'bg-success-50 text-success-600'
									: 'bg-surface-sunken text-ink-400'}"
							>
								{criterionCount}
							</span>
						</summary>
						<div class="mt-2.5 space-y-2">
							{#each acceptance as criterion, i (criterion.id)}
								<div class="flex items-start gap-2">
									<span class="mt-2 shrink-0 text-[0.625rem] font-semibold tabular-nums text-ink-400">{i + 1}.</span>
									{#if criterion.wizardId !== undefined}
										<textarea
											value={criterion.title}
											oninput={(e) =>
												store.updateAcceptanceCriterion(leaf.id, criterion.wizardId ?? '', e.currentTarget.value)}
											rows="2"
											placeholder="e.g. Given an overdue invoice, when the user pays in full, then its status becomes Paid."
											class="w-full resize-y rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
										></textarea>
										<button
											type="button"
											onclick={() => store.removeAcceptanceCriterion(leaf.id, criterion.wizardId ?? '')}
											aria-label="Remove criterion"
											class="mt-1 shrink-0 rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-danger-500"
										>
											<Icon name="x" size={13} />
										</button>
									{:else}
										<!-- Authored through the model, by an AI client or the behavior editor. It
										     is shown as it stands and edited where it was written, so this panel
										     can never silently rewrite a criterion it does not own. -->
										<div class="w-full rounded-field border border-line bg-surface px-3 py-2">
											<p class="text-sm text-ink-700">{criterion.title}</p>
											{#if criterion.description}
												<p class="mt-1 text-xs text-ink-500">{criterion.description}</p>
											{/if}
											<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
												<span
													class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] text-ink-400"
												>
													from the model
												</span>
												{#if criterion.status}
													<span
														class="rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-normal {criterion.status ===
														'superseded'
															? 'bg-surface-sunken text-ink-400'
															: 'bg-brand-50 text-brand-600'}"
													>
														{criterion.status}
													</span>
												{/if}
												{#if criterion.supersededBy.length > 0}
													<span class="text-[0.625rem] text-warning-600">
														superseded by {criterion.supersededBy.join(', ')}
													</span>
												{/if}
											</div>
										</div>
									{/if}
								</div>
							{/each}
							<!-- Given / When / Then criteria: the situation, what happens, what the
							     product does, with the outcome expected and the gap they cover. -->
							{#if rulesStore}
								{#each structured as criterion (criterion.id)}
									<EdgeCaseCard store={rulesStore} edgeCase={criterion} features={caseFeatures} />
								{/each}
							{/if}
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() => store.addAcceptanceCriterion(leaf.id)}
									class="inline-flex items-center gap-1 rounded-field border border-dashed border-line px-2.5 py-1.5 text-[0.6875rem] font-medium text-brand-600 hover:bg-surface"
								>
									<Icon name="plus" size={12} /> Add criterion
								</button>
								{#if rulesStore}
									<button
										type="button"
										onclick={() => rulesStore.addEdgeCase({ relatedFeatureId: leaf.id })}
										class="inline-flex items-center gap-1 rounded-field border border-dashed border-line px-2.5 py-1.5 text-[0.6875rem] font-medium text-brand-600 hover:bg-surface"
									>
										<Icon name="plus" size={12} /> Given / When / Then
									</button>
								{/if}
							</div>
						</div>
					</details>

					<!-- ── Dependencies (this feature depends on other leaves) ──────────── -->
					<details class="rounded-field border border-line bg-surface-sunken/40 p-3" open={deps.length > 0}>
						<summary
							class="flex cursor-pointer list-none items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
						>
							<Icon name="layers" size={12} class="text-brand-500" /> Dependencies
							<span class="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-300">
								· needs these first
							</span>
							<span
								class="ml-auto rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tabular-nums normal-case tracking-normal {deps.length >
								0
									? 'bg-success-50 text-success-600'
									: 'bg-surface-sunken text-ink-400'}"
							>
								{deps.length}
							</span>
						</summary>
						<div class="mt-2.5 space-y-2">
							{#if otherLeaves.length === 0}
								<p class="text-[0.6875rem] text-ink-400">No other features to depend on yet.</p>
							{:else}
								<div class="max-h-44 space-y-1 overflow-y-auto pr-1">
									{#each otherLeaves as other (other.id)}
										<label class="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1 text-[0.8125rem] text-ink-700 hover:bg-surface">
											<input
												type="checkbox"
												checked={deps.includes(other.id)}
												onchange={() => store.toggleDependency(leaf.id, other.id)}
												class="size-3.5 shrink-0 accent-brand-500"
											/>
											<span class="truncate">{other.name || 'Untitled feature'}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</details>

					<!-- ── Sources: cited from the project register only (no free-form citation) ── -->
					<SourceCitations
						selected={sourceIds}
						onToggle={(sourceId) => store.toggleSource(leaf.id, sourceId)}
						subject="this feature"
					/>
				</div>
				<div class="min-w-0 space-y-4">
					<!-- ── Status (what the engine reads: maturity, hand-set or computed, and the model counts) ── -->
					<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
						<p class="mb-2 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">Status</p>
						<dl class="space-y-2 text-xs">
							<div class="flex min-h-6 items-center justify-between gap-3">
								<dt class="text-ink-500">Maturity</dt>
								<dd class="relative inline-flex items-center">
									<span
										class="inline-flex h-6 items-center gap-1 rounded-field px-2 text-[0.6875rem] font-semibold {effectiveStage
											? stageChipTone(effectiveStage)
											: 'bg-surface-sunken text-ink-400'}"
									>
										<Icon name="gauge" size={11} /> {effectiveStage ? stageLabel(effectiveStage) : 'Not scored'} ▾
									</span>
									<select
										value={manualStage == null ? '' : clampStageLevel(manualStage)}
										onchange={(e) =>
											store.setLeafStage(leaf.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
										aria-label="Set spec maturity"
										class="absolute inset-0 cursor-pointer opacity-0"
									>
										<option value="">Auto (computed)</option>
										{#each MATURITY_STAGES as s (s.level)}
											<option value={s.level}>{s.level}/{MATURITY_STAGE_COUNT} · {s.label}</option>
										{/each}
									</select>
								</dd>
							</div>
						</dl>
						<!-- Model — engine-derived counts, one read-only summary line -->
						<div class="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-[0.6875rem] text-ink-500">
							<span class="text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">Model</span>
							<span class="ml-auto flex items-center gap-2 tabular-nums">
								<span><span class="font-bold text-ink-900">{surfaceCount}</span> Surfaces</span>
								<span class="text-line">·</span>
								<span><span class="font-bold text-ink-900">{actionCount}</span> Actions</span>
								<span class="text-line">·</span>
								<span><span class="font-bold text-ink-900">{stateCount}</span> States</span>
							</span>
						</div>
					</div>

					<!-- ── Next level (the engine's own checks · click one to jump to it) ── -->
					{#if maturityLoading && !maturity}
						<!-- Skeleton, not a label: the block takes the shape the card will have,
						     so the wait is visible where the content is going to appear. -->
						<div class="rounded-field border border-line bg-surface-sunken/40 p-3" aria-busy="true">
							<p
								class="mb-2 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
							>
								<Icon name="gauge" size={12} class="text-ink-300" /> Next level
							</p>
							<div class="animate-pulse space-y-1.5" aria-hidden="true">
								<div class="h-2 w-2/5 rounded bg-line"></div>
								<div class="h-6 w-full rounded bg-line"></div>
								<div class="h-6 w-full rounded bg-line"></div>
							</div>
							<p class="sr-only">Scoring this feature's model…</p>
						</div>
					{:else if stagePlan && maturity}
						<div
							data-anchor="readiness-next-level"
							class="space-y-2 rounded-field border border-line bg-surface-sunken/40 p-3"
						>
							<div
								class="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
							>
								<Icon name="gauge" size={12} class="text-brand-500" /> Next stage
								<span class="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-300">
									· from {stageLabel(stagePlan.currentLevel)}
								</span>
								<span
									class="ml-auto rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tabular-nums normal-case tracking-normal {maturity.score >=
									maturity.maxScore
										? 'bg-success-50 text-success-600'
										: 'bg-surface-sunken text-ink-400'}"
								>
									{maturity.score}/{maturity.maxScore} checks
								</span>
							</div>

							{#if stagePlan.nextLevel === null}
								{#if stagePlan.laterSteps.length === 0}
									<p class="text-[0.6875rem] leading-snug text-ink-500">
										Every check the engine runs on this feature passes. Readiness moves from here by
										proving it in code, not by authoring more spec.
									</p>
								{:else}
									<!-- Top of the ladder, but not a clean sheet: checks still fail, they just
									     cannot move the badge any higher. Saying "everything passes" would lie. -->
									<p class="text-[0.6875rem] leading-snug text-ink-500">
										<span class="font-semibold text-ink-800">{stageLabel(stagePlan.currentLevel)}</span>
										is the top of the ladder: no remaining check would raise the badge.
										{stagePlan.laterSteps.length}
										still {stagePlan.laterSteps.length === 1 ? 'fails' : 'fail'}.
									</p>
								{/if}
							{:else if stagePlan.exhaustive}
								<p class="text-[0.6875rem] leading-snug text-ink-500">
									<span class="font-semibold text-ink-800"
										>{stagePlan.checksToNextLevel} check{stagePlan.checksToNextLevel === 1
											? ''
											: 's'}</span
									>
									to reach
									<span class="font-semibold text-ink-800"
										>{stageLabel(stagePlan.nextLevel)} ({stagePlan.nextLevel}/{MATURITY_STAGE_COUNT})</span
									>
								</p>
							{:else}
								<!-- Floored reading: the engine holds the score down and names only the
								     check that unlocks the rest, so no level is promised here. -->
								<p class="text-[0.6875rem] leading-snug text-ink-500">
									Not scored yet. <span class="font-semibold text-ink-800">Fix this first</span>, then
									the ladder starts.
								</p>
							{/if}

							{#if stagePlan.nextSteps.length > 0}
								<ul class="space-y-1">
									{#each stagePlan.nextSteps as step, i (`${step.area}-${step.target}-${i}`)}
										{@render checkRow(step)}
									{/each}
								</ul>
							{/if}
							{#if stagePlan.laterSteps.length > 0}
								<details>
									<summary
										class="cursor-pointer text-[0.625rem] text-ink-400 marker:text-ink-300 hover:text-ink-600"
									>
										{stagePlan.nextSteps.length > 0
											? `${stagePlan.laterSteps.length} more check${stagePlan.laterSteps.length === 1 ? '' : 's'} after that`
											: `Show the ${stagePlan.laterSteps.length} failing check${stagePlan.laterSteps.length === 1 ? '' : 's'}`}
									</summary>
									<ul class="mt-1 space-y-1">
										{#each stagePlan.laterSteps as step, i (`${step.area}-${step.target}-${i}`)}
											{@render checkRow(step)}
										{/each}
									</ul>
								</details>
							{/if}

							{#if stageIsManual && manualStage != null}
								<p class="border-t border-line pt-2 text-[0.625rem] leading-snug text-ink-400">
									Maturity is set by hand to {stageLabel(clampStageLevel(manualStage))}, so the chip above
									will not move when these pass. The computed stage is
									{stageLabel(stagePlan.currentLevel)}.
								</p>
							{/if}
						</div>
					{/if}

					<!-- ══ Behavior model (engine-backed, read-only source of truth) ═════ -->
					<div class="flex items-center gap-2 pt-1">
						<Icon name="sparkles" size={13} class="text-brand-500" />
						<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">Behavior model</p>
						<span class="h-px flex-1 bg-line"></span>
					</div>

					<!-- ── Summary (the engine's deterministic account of the model) ─────── -->
					<DigestSummary
						markdown={digestMarkdown || null}
						loading={behaviorLoading}
						loadingLabel="Reading what this feature does from the model…"
					/>

					<!-- ── Scenarios (read-only names from the engine) ─────────────────── -->
					{#if behavior && behavior.scenarios.length}
						<div>
							<p class="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
								Scenarios
							</p>
							{@render nameList('Scenarios', behavior.scenarios, 'check')}
						</div>
					{/if}

					<!-- ── Verification (Unspaghettit engine — source of truth) ────────── -->
					{#if hasEngineSignal}
						<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
									Verification · Behavior
								</p>
								{#if verdict}
									<span
										class="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-semibold {verdict.passed
											? 'bg-success-50 text-success-600'
											: 'bg-danger-50 text-danger-600'}"
									>
										<Icon name={verdict.passed ? 'check' : 'flag'} size={11} />
										{!verdict.passed ? 'Not ready' : assessment?.degraded.length ? 'Partial checks' : assessment?.evidence.explorationStatus === 'complete' ? 'Model checked' : 'Passed within bounds'}
									</span>
								{/if}
							</div>
							{#if assessment?.evidence}
								{#each assessment.evidence.advisories.filter((a) => !a.startsWith('These checks describe') && !a.startsWith('The solver settled')) as advisory}
									<p class="mb-2 text-[0.6875rem] text-ink-500">{advisory}</p>
								{/each}
							{/if}
							{#if scope}
								<p class="mb-2 text-[0.6875rem] {scope.open ? 'text-warning-600' : 'text-ink-500'}">{scope.text}</p>
							{/if}
							<div class="grid grid-cols-3 gap-2">
								{@render verifyStat(
									'Scenarios',
									scenarios ? `${scenarios.passed}/${scenarios.total}` : '-',
									scenarios && scenarios.failed > 0 ? 'danger' : scenarios && scenarios.total > 0 ? 'ok' : 'muted'
								)}
								{@render verifyStat('Blocking', blockingCount === null ? '-' : String(blockingCount), blockingCount ? 'danger' : blockingCount === null ? 'muted' : 'ok')}
								{@render verifyStat('Warnings', warningCount === null ? '-' : String(warningCount), warningCount ? 'warn' : warningCount === null ? 'muted' : 'ok')}
							</div>
							{#if findings.length > 0}
								<ul class="mt-3 space-y-2">
									{#each findings as finding (finding.key)}
										{@render findingCard(finding)}
									{/each}
								</ul>
							{:else if modelCheck && modelCheck.invariantViolations.length > 0}
								<ul class="mt-2 space-y-1 text-[0.6875rem] text-danger-600">
									{#each modelCheck.invariantViolations.slice(0, 3) as v (v.invariantName + v.actionName)}
										<li class="flex gap-1.5">
											<Icon name="flag" size={12} class="mt-0.5 shrink-0" />
											<span class="min-w-0"
												>"{v.invariantName}" can break{v.path.length ? ` · ${v.path.join(' → ')}` : ''}</span
											>
										</li>
									{/each}
								</ul>
							{/if}
							{#if gapSplit.unmapped > 0 || gapSplit.scenariosToWrite > 0}
								<ul class="mt-3 space-y-1 text-[0.6875rem] text-ink-500">
									{#if gapSplit.unmapped > 0}
										<li class="flex items-center gap-1.5">
											<Icon name="cpu" size={11} class="shrink-0" />
											{gapSplit.unmapped} action{gapSplit.unmapped === 1 ? '' : 's'} without mapped code yet
										</li>
									{/if}
									{#if gapSplit.scenariosToWrite > 0}
										<li class="flex items-center gap-1.5">
											<Icon name="check" size={11} class="shrink-0" />
											{gapSplit.scenariosToWrite} scenario{gapSplit.scenariosToWrite === 1 ? '' : 's'} the solver can write (ask your AI client for the spec gaps)
										</li>
									{/if}
								</ul>
							{/if}
							{#if gapSplit.modeling.length > 0}
								<details class="mt-2">
									<summary class="flex cursor-pointer list-none items-center gap-1.5 text-[0.6875rem] font-medium text-ink-500">
										<Icon name="list" size={12} />
										Other modeling gaps · {gapSplit.modeling.length}
									</summary>
									<ul class="mt-2 space-y-1.5">
										{#each [...gapSplit.modeling.filter((g) => g.severity === 'critical'), ...gapSplit.modeling.filter((g) => g.severity !== 'critical')].slice(0, GAP_CAP) as gap (gap.entityId + gap.reason)}
											{@render specGapRow(gap)}
										{/each}
									</ul>
									{#if gapSplit.modeling.length > GAP_CAP}
										<p class="mt-1.5 text-[0.625rem] text-ink-400">+{gapSplit.modeling.length - GAP_CAP} more</p>
									{/if}
								</details>
							{/if}
						</div>
					{:else if behaviorLoading}
						<!-- The engine read is the slow one in this drawer (scenarios + bounded
						     model check + gap analysis). Hold its shape with the same card and
						     the same three tiles so the block fills in place instead of popping
						     into existence with no warning. -->
						<div class="rounded-field border border-line bg-surface-sunken/40 p-3" aria-busy="true">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
									Verification · Behavior
								</p>
								<span class="flex items-center gap-1 text-[0.625rem] text-ink-400">
									<span class="size-1.5 animate-pulse bg-ink-400"></span>
									Checking with the engine…
								</span>
							</div>
							<div class="grid animate-pulse grid-cols-3 gap-2" aria-hidden="true">
								{@render verifyStatSkeleton('Scenarios')}
								{@render verifyStatSkeleton('Blocking')}
								{@render verifyStatSkeleton('Warnings')}
							</div>
							<p class="sr-only">Running scenarios and the model check…</p>
						</div>
					{/if}

					<!-- ── Implementation coverage (spec entities mapped to real code) ──── -->
					{#if implementation && implementation.total > 0}
						<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
									Implementation · coverage
								</p>
								<span class="font-mono text-[0.6875rem] font-semibold tabular-nums text-ink-700">
									{implementation.implemented}/{implementation.total} · {implementation.percentage}%
								</span>
							</div>
							<Gauge
								parts={[{ value: implementation.implemented, tone: implementation.percentage >= 80 ? 'bg-success-500' : 'bg-brand-500' }]}
								total={implementation.total}
								counts
								height={6}
								track="bg-surface-sunken"
								class="w-full"
								progress={implementation.percentage}
							/>
							<div class="mt-2 grid grid-cols-3 gap-2">
								{@render verifyStat(
									'Implemented',
									String(implementation.implemented),
									implementation.implemented > 0 ? 'ok' : 'muted'
								)}
								{@render verifyStat(
									'Partial',
									String(implementation.partial),
									implementation.partial > 0 ? 'warn' : 'muted'
								)}
								{@render verifyStat(
									'Missing',
									String(implementation.missing),
									implementation.missing > 0 ? 'warn' : 'ok'
								)}
							</div>
							<!-- Proven is a different claim from located, so it sits apart from the bar
							     and never feeds its percentage. Hidden when the engine does not report it. -->
							{#if implementation.proven}
								<p class="mt-2 text-[0.6875rem] leading-snug text-ink-500">
									Proven against the code: {implementation.proven.actions} of {implementation.proven.total} actions
								</p>
							{/if}
						</div>
					{/if}

					<!-- ── Engine-detected gaps (read-only signal) ─────────────────────── -->
					{#if gaps.length > 0}
						<div class="rounded-field border border-warning-100 bg-warning-50/40 p-3">
							<p class="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-warning-600">
								<Icon name="flag" size={12} /> {gaps.length} gap{gaps.length === 1 ? '' : 's'} detected
							</p>
							<ul class="space-y-1 text-[0.6875rem] text-ink-600">
								{#each gaps.slice(0, 5) as gap (gap.name + gap.type)}
									<li class="flex gap-1.5">
										<span class="font-medium text-warning-600">{gap.type}:</span>
										<span class="min-w-0">{gap.name} - {gap.reason}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

				</div>
			</div>
		{:else}
			<!-- ── Narrow view: only why the feature exists ── -->
			<!-- ── Feature card (one place · problem → solution → value) ────────── -->
			<div class="space-y-3 rounded-field border border-line bg-surface-sunken/40 p-3">
				<div
					class="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
				>
					<Icon name="grid" size={12} class="text-brand-500" /> Feature card
					<span class="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-300">
						· problem, solution, value
					</span>
					<span
						class="ml-auto rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold tabular-nums normal-case tracking-normal {cardFilled >
						0
							? 'bg-success-50 text-success-600'
							: 'bg-surface-sunken text-ink-400'}"
					>
						{cardFilled}/4
					</span>
				</div>
				{#if cardFieldShown('problem')}
				<div>
					<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-problem">
						Problem
						<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· why this exists</span>
					</label>
					<textarea
						id="leaf-problem"
						value={meta.problem ?? ''}
						oninput={(e) => store.updateLeafMeta(leaf.id, { problem: e.currentTarget.value })}
						rows="2"
						placeholder="e.g. Customers can't pay overdue invoices without calling support."
						class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					></textarea>
				</div>
				{/if}
				{#if cardFieldShown('solution')}
				<div>
					<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-desc">
						What it does
						<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· the solution</span>
					</label>
					<textarea
						id="leaf-desc"
						value={whatItDoes}
						oninput={(e) => store.updateFeature(leaf.id, 'description', e.currentTarget.value)}
						rows="2"
						placeholder="e.g. Let a customer settle an overdue invoice in one click."
						class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					></textarea>
				</div>
				{/if}
				{#if cardFieldShown('effect')}
				<div>
					<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-effect">
						Expected effect
						<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· measurable outcome</span>
					</label>
					<textarea
						id="leaf-effect"
						value={meta.expectedEffect ?? ''}
						oninput={(e) => store.updateLeafMeta(leaf.id, { expectedEffect: e.currentTarget.value })}
						rows="2"
						placeholder="e.g. Cuts dunning follow-ups by ~30% and shortens time-to-cash."
						class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					></textarea>
				</div>
				{/if}
				{#if cardFieldShown('value')}
				<div>
					<label class="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-value">
						Value
						<span class="ml-1 font-normal normal-case tracking-normal text-ink-300">· qualitative benefit</span>
					</label>
					<textarea
						id="leaf-value"
						value={meta.value ?? ''}
						oninput={(e) => store.updateLeafMeta(leaf.id, { value: e.currentTarget.value })}
						rows="2"
						placeholder="e.g. Faster cash collection and fewer support tickets."
						class="w-full field-sizing-content resize-none rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					></textarea>
				</div>
				{/if}
				{#if !expanded && shownCardFields.size === 0}
					<p class="text-[0.75rem] text-ink-400">Nobody has said yet why this feature exists.</p>
				{/if}
				{#if !expanded && !cardComplete && canEdit}
					<button
						type="button"
						onclick={completeCard}
						class="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-brand-600 hover:underline"
					>
						<Icon name="plus" size={12} /> Complete ({cardFilled}/4)
					</button>
				{/if}
			</div>

			{#if actions.length > 0}
				<button
					type="button"
					onclick={() => reveal('leaf-actions')}
					class="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-ink-500 hover:text-brand-600"
				>
					<Icon name="bolt" size={12} />
					{actions.length} action{actions.length === 1 ? '' : 's'}
					<Icon name="arrow-right" size={11} />
				</button>
			{/if}
			<div class="flex items-center justify-between gap-3">
				{#if criterionCount > 0}
					<button
						type="button"
						onclick={() => reveal('leaf-acceptance')}
						class="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-ink-500 hover:text-brand-600"
					>
						<Icon name="check" size={12} />
						{criterionCount} acceptance criteri{criterionCount === 1 ? 'on' : 'a'}
						<Icon name="arrow-right" size={11} />
					</button>
				{:else}
					<span class="text-[0.6875rem] text-ink-400">No acceptance criteria yet</span>
				{/if}
				<button
					type="button"
					onclick={() => onExpandedChange?.(true)}
					class="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-brand-600 hover:underline"
				>
					<Icon name="maximize" size={12} /> See more
				</button>
			</div>
		{/if}

		<!-- ── Delete impact preview (W8) — in-app confirmation with downstream ties -->
		{#if confirmingDelete}
			<div class="rounded-field border border-danger-100 bg-danger-50/40 p-3">
				<p class="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-danger-600">
					<Icon name="flag" size={12} /> Delete “{leaf.name || 'unnamed'}”?
				</p>
				<p class="mt-1 text-[0.6875rem] leading-snug text-ink-500">
					This removes the leaf and its bindings. Downstream references:
				</p>
				<dl class="mt-2 space-y-1 text-[0.6875rem]">
					<div class="flex items-center justify-between gap-3">
						<dt class="text-ink-500">Priority</dt>
						<dd class="font-medium {deletePriorityLabel ? 'text-ink-800' : 'text-ink-400'}">
							{deletePriorityLabel ?? 'Unassigned'}
						</dd>
					</div>
					<div class="flex items-center justify-between gap-3">
						<dt class="text-ink-500">Release</dt>
						<dd class="font-medium {deleteReleaseName ? 'text-ink-800' : 'text-ink-400'}">
							{deleteReleaseName ?? 'Unscheduled'}
						</dd>
					</div>
				</dl>
				<div class="mt-2 border-t border-danger-100 pt-2 text-[0.6875rem]">
					{#if deleteDependantsFailed}
						<p class="text-ink-500">What rests on it could not be read from the knowledge graph.</p>
					{:else if deleteDependants === null}
						<p class="text-ink-400">Weighing what rests on it&hellip;</p>
					{:else if deleteDependants.total === 0}
						<p class="text-ink-500">{describeDependants(deleteDependants)}</p>
					{:else}
						<p class="font-medium text-danger-600">{describeDependants(deleteDependants)}</p>
						<div class="mt-1.5 space-y-1.5">
							{#each deleteDependants.groups as group (group.kind)}
								{@render nameList(group.label, group.names, 'grid')}
							{/each}
						</div>
					{/if}
				</div>
				<div class="mt-3 flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={() => (confirmingDelete = false)}
						class="rounded-field border border-line px-2.5 py-1.5 text-[0.6875rem] font-medium text-ink-500 hover:bg-surface-sunken"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={!deleteWeighed}
						title={deleteWeighed ? undefined : 'What rests on this feature is named before it goes.'}
						onclick={() => {
							if (!deleteWeighed) return;
							const name = leaf.name || 'unnamed';
							store.removeFeature(leaf.id);
							confirmingDelete = false;
							store.notifier.notify('info', `Feature “${name}” deleted.`);
						}}
						class="inline-flex items-center gap-1 rounded-field bg-danger-500 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-white hover:bg-danger-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Icon name="x" size={12} /> Delete feature
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

{#snippet verifyStat(label: string, value: string, tone: 'ok' | 'warn' | 'danger' | 'muted')}
	<div class="rounded-field border border-line bg-surface px-2 py-1.5 text-center">
		<div class="text-[0.5625rem] font-medium uppercase tracking-wider text-ink-400">{label}</div>
		<div
			class="mt-0.5 text-sm font-bold {tone === 'danger'
				? 'text-danger-600'
				: tone === 'warn'
					? 'text-warning-600'
					: tone === 'ok'
						? 'text-success-600'
						: 'text-ink-400'}"
		>
			{value}
		</div>
	</div>
{/snippet}

{#snippet verifyStatSkeleton(label: string)}
	<div class="rounded-field border border-line bg-surface px-2 py-1.5 text-center">
		<div class="text-[0.5625rem] font-medium uppercase tracking-wider text-ink-300">{label}</div>
		<div class="mx-auto mt-1 h-3 w-6 rounded bg-line"></div>
	</div>
{/snippet}

{#snippet findingCard(finding: ProvenFinding)}
	<li class="rounded-field border bg-surface px-2.5 py-2 {finding.tone === 'blocking' ? 'border-danger-200' : 'border-warning-200'}">
		<div class="flex items-center gap-1.5">
			<span
				class="rounded-pill px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-wide {finding.tone === 'blocking'
					? 'bg-danger-50 text-danger-600'
					: 'bg-warning-50 text-warning-600'}">{finding.tone === 'blocking' ? 'Blocking' : 'Warning'}</span
			>
			<span class="text-[0.625rem] font-semibold text-ink-500">{finding.label}</span>
		</div>
		<p class="mt-1 text-[0.75rem] font-medium leading-snug text-ink-800">{finding.requirement}</p>
		<dl class="mt-1.5 grid grid-cols-[3rem_1fr] gap-x-1.5 gap-y-0.5 text-[0.6875rem] leading-snug">
			<dt class="font-semibold text-ink-400">Given</dt>
			<dd class="text-ink-600">{finding.given}</dd>
			{#if finding.when.length > 0}
				<dt class="font-semibold text-ink-400">When</dt>
				<dd class="text-ink-600">
					{#each finding.when as step, i (i)}
						<div>{i > 0 ? '→ ' : ''}{step}</div>
					{/each}
				</dd>
			{/if}
			<dt class="font-semibold text-ink-400">Then</dt>
			<dd class="text-ink-700">{finding.then}</dd>
		</dl>
		{#if finding.fix}
			<p class="mt-1.5 flex items-start gap-1 text-[0.625rem] leading-snug text-brand-600">
				<Icon name="arrow-right" size={10} class="mt-0.5 shrink-0" />
				<span class="min-w-0">{finding.fix}</span>
			</p>
		{/if}
	</li>
{/snippet}

{#snippet specGapRow(gap: SpecGap)}
	<li class="rounded-field border border-line bg-surface px-2 py-1.5">
		<div class="flex items-center gap-1.5">
			<span
				class="size-1.5 shrink-0 {gap.severity === 'critical'
					? 'bg-warning-500'
					: 'bg-ink-300'}"
			></span>
			<span
				class="rounded-pill bg-surface-sunken px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-wide text-ink-400"
				>{gap.entityType}</span
			>
			<span class="min-w-0 truncate text-[0.6875rem] font-semibold text-ink-700">{gap.entityName}</span>
			{#if gap.entityId}
				<span class="ml-auto shrink-0 font-mono text-[0.5625rem] text-ink-300">{gap.entityId}</span>
			{/if}
		</div>
		<p class="mt-0.5 text-[0.625rem] leading-snug text-ink-500">{gap.reason}</p>
		{#if gap.suggestedFix}
			<p class="mt-0.5 flex items-start gap-1 text-[0.625rem] leading-snug text-brand-600">
				<Icon name="arrow-right" size={10} class="mt-0.5 shrink-0" />
				<span class="min-w-0">{gap.suggestedFix}</span>
			</p>
		{/if}
	</li>
{/snippet}

{#snippet nameList(label: string, items: readonly string[], icon: 'grid' | 'cpu' | 'check')}
	<div>
		<p class="mb-1 flex items-center gap-1 text-[0.625rem] font-medium uppercase tracking-wider text-ink-400">
			<Icon name={icon} size={10} />
			{label} · {items.length}
		</p>
		<div class="flex flex-wrap gap-1">
			{#each items as name, i (label + i)}
				<span class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[0.6875rem] text-ink-700">{name}</span>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet checkRow(step: FeatureMaturityIssue)}
	<li>
		<button
			type="button"
			onclick={() => revealCheck(step)}
			class="flex w-full items-start gap-1.5 rounded-field border border-line bg-surface px-2 py-1.5 text-left hover:border-brand-200 hover:bg-brand-50/40"
		>
			<span
				class="mt-1.5 size-1.5 shrink-0 {step.severity === 'critical'
					? 'bg-danger-500'
					: 'bg-warning-500'}"
			></span>
			<span class="min-w-0 flex-1">
				<span class="block text-[0.6875rem] leading-snug text-ink-700">{step.message}</span>
				{#if step.targetKind !== 'feature'}
					<span class="mt-0.5 block truncate text-[0.625rem] text-ink-400">
						{step.targetKind} · {step.target} · {step.area}
					</span>
				{/if}
			</span>
			<Icon name="arrow-right" size={11} class="mt-1 shrink-0 text-ink-300" />
		</button>
	</li>
{/snippet}
