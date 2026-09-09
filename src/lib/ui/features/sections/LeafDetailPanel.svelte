<script lang="ts">
	import {
		Icon,
		MATURITY_STAGES,
		MATURITY_STAGE_COUNT,
		stageFromScore,
		stageFromTrl,
		stageLabel,
		trlOfStage
	} from '$ui/design-system';
	import {
		familiesDirectlyUnderCore,
		subFamiliesOf,
		planNextTrl,
		MVP_TIERS,
		type Family,
		type LeafMeta
	} from '$domain/features';
	import type { FeatureAdvice, FeatureAssessment } from '$application/use-cases';
	import type { BehaviorFeatureSummary } from '$application/summarize-behavior';
	import type { FeatureMaturityIssue, FeatureMaturityReport, SpecGap } from '$application/ports';
	import type { WorkTarget } from '$domain/features';
	import type { Collaborator } from '$domain/team/team';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { FeaturesStore } from '../draft-store.svelte';
	import MvpChip from '../MvpChip.svelte';
	import ReleaseChip from '../ReleaseChip.svelte';
	import FamilyChip from '../FamilyChip.svelte';
	import AssigneeChip from '../AssigneeChip.svelte';
	import ContributorPicker from '../ContributorPicker.svelte';
	import { unspaActionPath, unspaFeatureHref, unspaFeaturePath } from '../unspa-dashboard-url';
	import { renderMarkdown } from '$ui/design-system/markdown';
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
		/** Behavior-editor base URL, for the dedicated "open in a new tab" icon only. */
		unspaBaseUrl?: string | null;
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor?: (path?: string | null) => void;
	}
	let {
		store,
		advice,
		localSummaries = [],
		collaborators,
		unspaBaseUrl = null,
		onOpenEditor
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
	// Families available in this leaf's core, flattened with a nested path label.
	const familyOptions = $derived.by(() => {
		if (!leaf) return [] as { id: string; label: string }[];
		const out: { id: string; label: string }[] = [];
		const walk = (fams: Family[], prefix: string) => {
			for (const f of fams) {
				const label = prefix ? `${prefix} › ${f.name || 'Untitled'}` : f.name || 'Untitled';
				out.push({ id: f.id, label });
				walk(subFamiliesOf(store.draft, f.id), label);
			}
		};
		walk(familiesDirectlyUnderCore(store.draft, leaf.coreId), '');
		return out;
	});

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

	// Requirements-backbone metadata (Next scope): acceptance criteria, dependencies
	// on other leaves, and a source link. All ride the same leafMeta residue seam.
	const acceptance = $derived(meta.acceptanceCriteria ?? []);
	const deps = $derived(meta.dependsOn ?? []);
	const sourceIds = $derived(meta.sourceIds ?? []);
	const otherLeaves = $derived(leaf ? store.draft.features.filter((f) => f.id !== leaf.id) : []);
	const featureName = (id: string) => store.draft.features.find((f) => f.id === id)?.name ?? id;

	// ── Delete impact preview (W8) — an in-app confirmation (replaces confirm())
	// that first enumerates the feature's downstream ties (MVP tier + release).
	let confirmingDelete = $state(false);
	const deleteMvpLabel = $derived(
		mvpTier ? (MVP_TIERS.find((t) => t.code === mvpTier)?.label ?? mvpTier) : null
	);
	const deleteRelease = $derived(
		releaseId ? (store.draft.releases.find((r) => r.id === releaseId) ?? null) : null
	);
	const deleteReleaseName = $derived(
		deleteRelease ? deleteRelease.name || deleteRelease.version || 'Untitled release' : null
	);
	// The local scoring of this feature's shell. NOT part of the engine assessment
	// below: it is read straight from the model, so it answers with the advisor
	// offline and lands in milliseconds. Declared here because the readiness chip
	// falls back to it.
	let maturity = $state<FeatureMaturityReport | null>(null);
	let maturityLoading = $state(false);

	// Spec maturity as a stage: a hand-set level (stored 1-9) wins over the
	// engine maturity score. Null only when neither exists yet (feature the
	// engine can't read).
	const manualTrl = $derived(leaf ? (store.getLeafMeta(leaf.id).trl ?? null) : null);
	// Falls back to the local maturity read while the cached advisor is still
	// refreshing, exactly like the tree's badge does. Without it the chip sat
	// unscored for seconds next to a maturity card already naming the stage.
	const effectiveStage = $derived<number | null>(
		manualTrl != null
			? stageFromTrl(manualTrl)
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

	// Where the drawer's behavior button goes. The button itself stays INSIDE
	// Lyriks (the Behavior tab's embedded editor, opened on this feature); only
	// the small icon beside it leaves for a dedicated tab, and that one is null
	// when no dashboard URL is configured.
	const unspaPath = $derived(leaf ? unspaFeaturePath(leaf.unspaghettitFeatureId) : null);
	const unspaHref = $derived(
		leaf ? unspaFeatureHref(leaf.unspaghettitFeatureId, unspaBaseUrl) : null
	);

	// Full Unspaghettit assessment (named behavior + executable scenarios +
	// model-check reachability + spec gaps + gated verdict), fetched on demand
	// when the drawer opens. Authoring stays in Unspa; this is the read-only
	// source-of-truth readout. Cleanup drops a stale response on leaf switch.
	let assessment = $state<FeatureAssessment | null>(null);
	let behaviorLoading = $state(false);
	// What stands between this feature and its next maturity stage. The engine's
	// own checks, projected through the SAME ladder the badge above uses, so the
	// number stops being a thermometer and becomes a to-do list. Null while the
	// shell has not been read (or does not exist yet).
	const stagePlan = $derived(maturity ? planNextTrl(maturity, stageFromScore) : null);
	// A hand-set stage wins in the chip but never changes what the engine
	// measures, so the card says which stage it is planning towards when the
	// two disagree.
	const stageIsManual = $derived(manualTrl !== null);

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
	// Spec gaps split by severity, critical first — each carries the entity id + a
	// suggested fix so the list is a to-do, not a bare count (Fix #10).
	const criticalGaps = $derived(specGaps.filter((g) => g.severity === 'critical'));
	const recommendedGaps = $derived(specGaps.filter((g) => g.severity !== 'critical'));
	const criticalSpecGaps = $derived(criticalGaps.length);
	const GAP_CAP = 8; // keep the drawer scannable; the rest collapse behind a count
	const hasEngineSignal = $derived(
		!!assessment?.available && (!!scenarios || !!modelCheck || !!verdict)
	);
	$effect(() => {
		const id = leaf?.id ?? null;
		assessment = null;
		confirmingDelete = false; // never carry a pending delete across leaf switches
		if (!id) return;
		let cancelled = false;
		behaviorLoading = true;
		fetch(
			`/api/features/behavior?projectId=${encodeURIComponent(store.draft.projectId)}&featureId=${encodeURIComponent(id)}`
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (!cancelled) assessment = (body?.assessment as FeatureAssessment | null) ?? null;
			})
			.catch(() => {
				if (!cancelled) assessment = null;
			})
			.finally(() => {
				if (!cancelled) behaviorLoading = false;
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
	<div class="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
		<!-- ── Header: names the feature (kicker + editable title) + editor link ── -->
		<div class="flex items-start gap-3">
			<span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
				<Icon name="grid" size={16} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">
					<span>Feature{coreOf?.name ? ` · in ${coreOf.name}` : ''}</span>
					<!-- The engine read behind this drawer takes seconds on a modelled
					     feature, and every block it feeds sits below the fold. This is the
					     one signal visible without scrolling, so opening the drawer never
					     looks finished while it is not. -->
					{#if behaviorLoading}
						<span
							class="flex items-center gap-1 font-medium normal-case tracking-normal text-ink-400"
							aria-live="polite"
						>
							<span class="size-1.5 animate-pulse rounded-full bg-ink-400"></span>
							Reading the model…
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
					{#if onOpenEditor && unspaPath}
						<button
							type="button"
							onclick={() => onOpenEditor(unspaPath)}
							class="inline-flex items-center gap-1 rounded-field bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
							title="Open this feature in the behavior editor"
						>
							<Icon name="cpu" size={13} /> Behavior editor
						</button>
					{/if}
					{#if unspaHref}
						<a
							href={unspaHref}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-brand-600"
							title="Open in a dedicated tab"
							aria-label="Open this feature in a dedicated tab"
						>
							<Icon name="external-link" size={13} />
						</a>
					{/if}
				</span>
				{#if !withinCap}
					<span class="text-[10px] font-medium text-danger-500">Over cap - split first.</span>
				{/if}
			</div>
		</div>

		<!-- ── KPI band (right under the name · status key/value + model line, no card) ── -->
		<div class="-mx-5 border-y border-line bg-surface-sunken/30 px-5 py-3">
			<!-- Status — editable KPIs; label left, control aligned right so nothing floats -->
			<p class="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-400">Status</p>
			<dl class="space-y-2 text-xs">
				<div class="flex min-h-6 items-center justify-between gap-3">
					<dt class="text-ink-500">Maturity</dt>
					<dd class="relative inline-flex items-center">
						<span
							class="inline-flex h-6 items-center gap-1 rounded-field px-2 text-[11px] font-semibold {effectiveStage
								? stageChipTone(effectiveStage)
								: 'bg-surface-sunken text-ink-400'}"
						>
							<Icon name="gauge" size={11} /> {effectiveStage ? stageLabel(effectiveStage) : 'Not scored'} ▾
						</span>
						<select
							value={manualTrl == null ? '' : trlOfStage(stageFromTrl(manualTrl))}
							onchange={(e) =>
								store.setLeafTrl(leaf.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							aria-label="Set spec maturity"
							class="absolute inset-0 cursor-pointer opacity-0"
						>
							<option value="">Auto (computed)</option>
							{#each MATURITY_STAGES as s (s.level)}
								<option value={trlOfStage(s.level)}>{s.level}/{MATURITY_STAGE_COUNT} · {s.label}</option>
							{/each}
						</select>
					</dd>
				</div>
				<div class="flex min-h-6 items-center justify-between gap-3">
					<dt class="text-ink-500">MVP</dt>
					<dd>
						<MvpChip
							tier={mvpTier}
							onPick={(t) => (t ? store.setMvpTier(leaf.id, t) : store.clearMvpTier(leaf.id))}
						/>
					</dd>
				</div>
				<div class="flex min-h-6 items-center justify-between gap-3">
					<dt class="text-ink-500">Release</dt>
					<dd>
						<ReleaseChip
							{releaseId}
							releases={store.draft.releases}
							onPick={(id) =>
								id ? store.assignFeatureToRelease(leaf.id, id) : store.unassignFeatureFromRelease(leaf.id)}
						/>
					</dd>
				</div>
				<div class="flex min-h-6 items-center justify-between gap-3">
					<dt class="text-ink-500">Owner</dt>
					<dd>
						<AssigneeChip
							assigneeId={store.getAssignment({ kind: 'feature', featureId: leaf.id })?.assigneeId ?? null}
							{collaborators}
							onPick={(id) =>
								store.assignWorkItem({ kind: 'feature', featureId: leaf.id } as WorkTarget, id)}
						/>
					</dd>
				</div>
				<div class="flex min-h-6 items-center justify-between gap-3">
					<dt class="text-ink-500">Contributors</dt>
					<dd>
						<ContributorPicker
							selectedIds={store.getFeatureContributors(leaf.id)}
							people={collaborators}
							onToggle={(personId) => store.toggleFeatureContributor(leaf.id, personId)}
						/>
					</dd>
				</div>
			</dl>
			<!-- Model — engine-derived counts, one read-only summary line -->
			<div class="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-[11px] text-ink-500">
				<span class="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-400">Model</span>
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
					class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
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
					class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
				>
					<Icon name="gauge" size={12} class="text-brand-500" /> Next stage
					<span class="text-[9px] font-medium normal-case tracking-normal text-ink-300">
						· from {stageLabel(stagePlan.currentLevel)}
					</span>
					<span
						class="ml-auto rounded-pill px-1.5 py-0.5 text-[9px] font-semibold tabular-nums normal-case tracking-normal {maturity.score >=
						maturity.maxScore
							? 'bg-success-50 text-success-600'
							: 'bg-surface-sunken text-ink-400'}"
					>
						{maturity.score}/{maturity.maxScore} checks
					</span>
				</div>

				{#if stagePlan.nextLevel === null}
					{#if stagePlan.laterSteps.length === 0}
						<p class="text-[11px] leading-snug text-ink-500">
							Every check the engine runs on this feature passes. Readiness moves from here by
							proving it in code, not by authoring more spec.
						</p>
					{:else}
						<!-- Top of the ladder, but not a clean sheet: checks still fail, they just
						     cannot move the badge any higher. Saying "everything passes" would lie. -->
						<p class="text-[11px] leading-snug text-ink-500">
							<span class="font-semibold text-ink-800">{stageLabel(stagePlan.currentLevel)}</span>
							is the top of the ladder: no remaining check would raise the badge.
							{stagePlan.laterSteps.length}
							still {stagePlan.laterSteps.length === 1 ? 'fails' : 'fail'}.
						</p>
					{/if}
				{:else if stagePlan.exhaustive}
					<p class="text-[11px] leading-snug text-ink-500">
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
					<p class="text-[11px] leading-snug text-ink-500">
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
							class="cursor-pointer text-[10px] text-ink-400 marker:text-ink-300 hover:text-ink-600"
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

				{#if stageIsManual && manualTrl != null}
					<p class="border-t border-line pt-2 text-[10px] leading-snug text-ink-400">
						Maturity is set by hand to {stageLabel(stageFromTrl(manualTrl))}, so the chip above
						will not move when these pass. The computed stage is
						{stageLabel(stagePlan.currentLevel)}.
					</p>
				{/if}
			</div>
		{/if}

		<!-- ── Feature card (one place · problem → solution → value) ────────── -->
		<div class="space-y-3 rounded-field border border-line bg-surface-sunken/40 p-3">
			<div
				class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
			>
				<Icon name="grid" size={12} class="text-brand-500" /> Feature card
				<span class="text-[9px] font-medium normal-case tracking-normal text-ink-300">
					· problem, solution, value
				</span>
				<span
					class="ml-auto rounded-pill px-1.5 py-0.5 text-[9px] font-semibold tabular-nums normal-case tracking-normal {cardFilled >
					0
						? 'bg-success-50 text-success-600'
						: 'bg-surface-sunken text-ink-400'}"
				>
					{cardFilled}/4
				</span>
			</div>
			<div>
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-problem">
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
			<div>
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-desc">
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
			<div>
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-effect">
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
			<div>
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400" for="leaf-value">
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
		</div>

		<!-- ── Acceptance criteria (in-app authoring · testable requirements) ── -->
		<details class="rounded-field border border-line bg-surface-sunken/40 p-3" open={acceptance.length > 0}>
			<summary
				class="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
			>
				<Icon name="check" size={12} class="text-brand-500" /> Acceptance criteria
				<span class="text-[9px] font-medium normal-case tracking-normal text-ink-300">
					· how we know it's done
				</span>
				<span
					class="ml-auto rounded-pill px-1.5 py-0.5 text-[9px] font-semibold tabular-nums normal-case tracking-normal {acceptance.length >
					0
						? 'bg-success-50 text-success-600'
						: 'bg-surface-sunken text-ink-400'}"
				>
					{acceptance.length}
				</span>
			</summary>
			<div class="mt-2.5 space-y-2">
				{#each acceptance as criterion, i (criterion.id)}
					<div class="flex items-start gap-2">
						<span class="mt-2 shrink-0 text-[10px] font-semibold tabular-nums text-ink-400">{i + 1}.</span>
						<textarea
							value={criterion.text}
							oninput={(e) => store.updateAcceptanceCriterion(leaf.id, criterion.id, e.currentTarget.value)}
							rows="2"
							placeholder="e.g. Given an overdue invoice, when the user pays in full, then its status becomes Paid."
							class="w-full resize-y rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
						></textarea>
						<button
							type="button"
							onclick={() => store.removeAcceptanceCriterion(leaf.id, criterion.id)}
							aria-label="Remove criterion"
							class="mt-1 shrink-0 rounded p-1 text-ink-400 hover:bg-surface-sunken hover:text-danger-500"
						>
							<Icon name="x" size={13} />
						</button>
					</div>
				{/each}
				<button
					type="button"
					onclick={() => store.addAcceptanceCriterion(leaf.id)}
					class="inline-flex items-center gap-1 rounded-field border border-dashed border-line px-2.5 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-surface"
				>
					<Icon name="plus" size={12} /> Add criterion
				</button>
			</div>
		</details>

		<!-- ── Dependencies (this feature depends on other leaves) ──────────── -->
		<details class="rounded-field border border-line bg-surface-sunken/40 p-3" open={deps.length > 0}>
			<summary
				class="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
			>
				<Icon name="layers" size={12} class="text-brand-500" /> Dependencies
				<span class="text-[9px] font-medium normal-case tracking-normal text-ink-300">
					· needs these first
				</span>
				<span
					class="ml-auto rounded-pill px-1.5 py-0.5 text-[9px] font-semibold tabular-nums normal-case tracking-normal {deps.length >
					0
						? 'bg-success-50 text-success-600'
						: 'bg-surface-sunken text-ink-400'}"
				>
					{deps.length}
				</span>
			</summary>
			<div class="mt-2.5 space-y-2">
				{#if otherLeaves.length === 0}
					<p class="text-[11px] text-ink-400">No other features to depend on yet.</p>
				{:else}
					<div class="max-h-44 space-y-1 overflow-y-auto pr-1">
						{#each otherLeaves as other (other.id)}
							<label class="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1 text-[13px] text-ink-700 hover:bg-surface">
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

		<!-- ── Sources: cite the project register, plus a free-form extra citation ─── -->
		<SourceCitations
			selected={sourceIds}
			onToggle={(sourceId) => store.toggleSource(leaf.id, sourceId)}
			subject="this feature"
		/>
		<div class="space-y-2 rounded-field border border-line bg-surface-sunken/40 p-3">
			<label class="block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="legacy-source-{leaf.id}">
				Additional citation
			</label>
			<input
				id="legacy-source-{leaf.id}"
				type="text"
				value={meta.sourceLink ?? ''}
				oninput={(e) => store.updateLeafMeta(leaf.id, { sourceLink: e.currentTarget.value })}
				placeholder="URL or citation not in the source register"
				class="w-full rounded-field border border-line bg-surface px-3 py-2 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
			/>
			{#if filled(meta.sourceLink) && /^https?:\/\//i.test(meta.sourceLink ?? '')}
				<a
					href={meta.sourceLink}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
				>
					Open source <Icon name="external-link" size={12} />
				</a>
			{/if}
		</div>

		<!-- ── Placement & binding: where this leaf sits ───────────────────── -->
		<div class="rounded-field border border-line bg-surface-sunken/60 p-3">
			<p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
				Placement & binding
			</p>
			<dl class="space-y-1.5 text-xs">
				<div class="flex items-center justify-between gap-3">
					<dt class="text-ink-500">Core</dt>
					<dd class="font-medium text-ink-800">{coreOf?.name || '-'}</dd>
				</div>
				<div class="flex items-center justify-between gap-3">
					<dt class="text-ink-500">Family</dt>
					<dd>
						<FamilyChip
							currentFamilyId={leaf.parentFamilyId}
							options={familyOptions}
							onPick={(famId) => store.moveFeature(leaf.id, leaf.coreId, famId)}
							onCreate={(name) => {
								const famId = store.addFamilyToCore(leaf.coreId, { name });
								store.moveFeature(leaf.id, leaf.coreId, famId);
							}}
						/>
					</dd>
				</div>
				<div class="flex items-center justify-between gap-3">
					<dt class="text-ink-500">Behavior feature ID</dt>
					<dd class="font-mono text-[11px] text-brand-600">{leaf.unspaghettitFeatureId}</dd>
				</div>
			</dl>
		</div>

		<!-- ══ Behavior model (engine-backed, read-only source of truth) ═════ -->
		<div class="flex items-center gap-2 pt-1">
			<Icon name="sparkles" size={13} class="text-brand-500" />
			<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Behavior model</p>
			<span class="h-px flex-1 bg-line"></span>
		</div>

		<!-- ── Summary (the engine's deterministic account of the model) ─────── -->
		{#if digestMarkdown}
			<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
				<p
					class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
				>
					<Icon name="list" size={12} class="text-brand-500" /> Summary
					<span class="text-[9px] font-medium normal-case tracking-normal text-ink-300">
						· read from the model, not written by anyone
					</span>
				</p>
				<!-- eslint-disable-next-line svelte/no-at-html-tags (sanitized by renderMarkdown) -->
				<article class="md-digest text-[11px] leading-relaxed text-ink-700">
					{@html renderMarkdown(digestMarkdown)}
				</article>
			</div>
		{:else if behaviorLoading}
			<div class="rounded-field border border-line bg-surface-sunken/40 p-3" aria-busy="true">
				<p
					class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"
				>
					<Icon name="list" size={12} class="text-ink-300" /> Summary
				</p>
				<div class="animate-pulse space-y-1.5" aria-hidden="true">
					<div class="h-2 w-1/3 rounded bg-line"></div>
					<div class="h-2 w-11/12 rounded bg-line"></div>
					<div class="h-2 w-4/5 rounded bg-line"></div>
					<div class="h-2 w-10/12 rounded bg-line"></div>
					<div class="h-2 w-2/3 rounded bg-line"></div>
				</div>
				<p class="sr-only">Reading what this feature does from the model…</p>
			</div>
		{/if}

		<!-- ── Scenarios (read-only names from the engine) ─────────────────── -->
		{#if behavior && behavior.scenarios.length}
			<div>
				<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
					Scenarios
				</p>
				{@render nameList('Scenarios', behavior.scenarios, 'check')}
			</div>
		{/if}

		<!-- ── Verification (Unspaghettit engine — source of truth) ────────── -->
		{#if hasEngineSignal}
			<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
				<div class="mb-2 flex items-center justify-between">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Verification · Behavior
					</p>
					{#if verdict}
						<span
							class="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold {verdict.passed
								? 'bg-success-50 text-success-600'
								: 'bg-danger-50 text-danger-600'}"
						>
							<Icon name={verdict.passed ? 'check' : 'flag'} size={11} />
							{verdict.passed ? 'Verified' : 'Not ready'}
						</span>
					{/if}
				</div>
				<div class="grid grid-cols-3 gap-2">
					{@render verifyStat(
						'Scenarios',
						scenarios ? `${scenarios.passed}/${scenarios.total}` : '-',
						scenarios && scenarios.failed > 0 ? 'danger' : scenarios && scenarios.total > 0 ? 'ok' : 'muted'
					)}
					{@render verifyStat(
						'Unreachable',
						modelCheck ? String(modelCheck.unreachableSurfaces.length) : '-',
						modelCheck && modelCheck.unreachableSurfaces.length > 0 ? 'warn' : 'ok'
					)}
					{@render verifyStat(
						'Invariant breaks',
						modelCheck ? String(modelCheck.invariantViolations.length) : '-',
						modelCheck && modelCheck.invariantViolations.length > 0 ? 'danger' : 'ok'
					)}
				</div>
				{#if modelCheck && modelCheck.invariantViolations.length > 0}
					<ul class="mt-2 space-y-1 text-[11px] text-danger-600">
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
				{#if specGaps.length > 0}
					<details class="mt-2" open={criticalSpecGaps > 0}>
						<summary
							class="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium {criticalSpecGaps >
							0
								? 'text-warning-600'
								: 'text-ink-500'}"
						>
							<Icon name="list" size={12} />
							{#if criticalSpecGaps > 0}
								{criticalSpecGaps} critical spec gap{criticalSpecGaps === 1 ? '' : 's'} to resolve
							{:else}
								{recommendedGaps.length} recommended spec gap{recommendedGaps.length === 1 ? '' : 's'}
							{/if}
						</summary>
						<ul class="mt-2 space-y-1.5">
							{#each [...criticalGaps, ...recommendedGaps].slice(0, GAP_CAP) as gap (gap.entityId + gap.reason)}
								{@render specGapRow(gap)}
							{/each}
						</ul>
						{#if specGaps.length > GAP_CAP}
							<p class="mt-1.5 text-[10px] text-ink-400">
								+{specGaps.length - GAP_CAP} more ({recommendedGaps.length} recommended)
							</p>
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
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Verification · Behavior
					</p>
					<span class="flex items-center gap-1 text-[10px] text-ink-400">
						<span class="size-1.5 animate-pulse rounded-full bg-ink-400"></span>
						Checking with the engine…
					</span>
				</div>
				<div class="grid animate-pulse grid-cols-3 gap-2" aria-hidden="true">
					{@render verifyStatSkeleton('Scenarios')}
					{@render verifyStatSkeleton('Unreachable')}
					{@render verifyStatSkeleton('Invariant breaks')}
				</div>
				<p class="sr-only">Running scenarios and the model check…</p>
			</div>
		{/if}

		<!-- ── Implementation coverage (spec entities mapped to real code) ──── -->
		{#if implementation && implementation.total > 0}
			<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
				<div class="mb-2 flex items-center justify-between">
					<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						Implementation · coverage
					</p>
					<span class="font-mono text-[11px] font-semibold tabular-nums text-ink-700">
						{implementation.implemented}/{implementation.total} · {implementation.percentage}%
					</span>
				</div>
				<div
					class="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken"
					role="progressbar"
					aria-valuenow={implementation.percentage}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						class="h-full rounded-pill {implementation.percentage >= 80
							? 'bg-success-500'
							: implementation.percentage > 0
								? 'bg-brand-500'
								: 'bg-transparent'}"
						style="width: {implementation.percentage}%"
					></div>
				</div>
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
			</div>
		{/if}

		<!-- ── Engine-detected gaps (read-only signal) ─────────────────────── -->
		{#if gaps.length > 0}
			<div class="rounded-field border border-warning-100 bg-warning-50/40 p-3">
				<p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-warning-600">
					<Icon name="flag" size={12} /> {gaps.length} gap{gaps.length === 1 ? '' : 's'} detected
				</p>
				<ul class="space-y-1 text-[11px] text-ink-600">
					{#each gaps.slice(0, 5) as gap (gap.name + gap.type)}
						<li class="flex gap-1.5">
							<span class="font-medium text-warning-600">{gap.type}:</span>
							<span class="min-w-0">{gap.name} - {gap.reason}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- ── Delete impact preview (W8) — in-app confirmation with downstream ties -->
		{#if confirmingDelete}
			<div class="rounded-field border border-danger-100 bg-danger-50/40 p-3">
				<p class="flex items-center gap-1.5 text-[11px] font-semibold text-danger-600">
					<Icon name="flag" size={12} /> Delete “{leaf.name || 'unnamed'}”?
				</p>
				<p class="mt-1 text-[11px] leading-snug text-ink-500">
					This removes the leaf and its bindings. Downstream references:
				</p>
				<dl class="mt-2 space-y-1 text-[11px]">
					<div class="flex items-center justify-between gap-3">
						<dt class="text-ink-500">MVP tier</dt>
						<dd class="font-medium {deleteMvpLabel ? 'text-ink-800' : 'text-ink-400'}">
							{deleteMvpLabel ?? 'Unassigned'}
						</dd>
					</div>
					<div class="flex items-center justify-between gap-3">
						<dt class="text-ink-500">Release</dt>
						<dd class="font-medium {deleteReleaseName ? 'text-ink-800' : 'text-ink-400'}">
							{deleteReleaseName ?? 'Unscheduled'}
						</dd>
					</div>
				</dl>
				<div class="mt-3 flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={() => (confirmingDelete = false)}
						class="rounded-field border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink-500 hover:bg-surface-sunken"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={() => {
							const name = leaf.name || 'unnamed';
							store.removeFeature(leaf.id);
							confirmingDelete = false;
							store.notifier.notify('info', `Feature “${name}” deleted.`);
						}}
						class="inline-flex items-center gap-1 rounded-field bg-danger-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-danger-600"
					>
						<Icon name="x" size={12} /> Delete feature
					</button>
				</div>
			</div>
		{/if}

		<div class="flex items-center justify-between pt-1">
			<button
				type="button"
				onclick={() => store.selectFeature(null)}
				class="text-[11px] font-medium text-ink-400 hover:text-ink-700"
			>
				Close panel
			</button>
			<button
				type="button"
				onclick={() => (confirmingDelete = true)}
				class="flex items-center gap-1 text-[11px] font-medium text-danger-500 hover:text-danger-600"
			>
				<Icon name="x" size={12} /> Remove feature
			</button>
		</div>
	</div>
{/if}

{#snippet verifyStat(label: string, value: string, tone: 'ok' | 'warn' | 'danger' | 'muted')}
	<div class="rounded-field border border-line bg-surface px-2 py-1.5 text-center">
		<div class="text-[9px] font-medium uppercase tracking-wider text-ink-400">{label}</div>
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
		<div class="text-[9px] font-medium uppercase tracking-wider text-ink-300">{label}</div>
		<div class="mx-auto mt-1 h-3 w-6 rounded bg-line"></div>
	</div>
{/snippet}

{#snippet specGapRow(gap: SpecGap)}
	<li class="rounded-field border border-line bg-surface px-2 py-1.5">
		<div class="flex items-center gap-1.5">
			<span
				class="size-1.5 shrink-0 rounded-full {gap.severity === 'critical'
					? 'bg-warning-500'
					: 'bg-ink-300'}"
			></span>
			<span
				class="rounded-pill bg-surface-sunken px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-ink-400"
				>{gap.entityType}</span
			>
			<span class="min-w-0 truncate text-[11px] font-semibold text-ink-700">{gap.entityName}</span>
			{#if gap.entityId}
				<span class="ml-auto shrink-0 font-mono text-[9px] text-ink-300">{gap.entityId}</span>
			{/if}
		</div>
		<p class="mt-0.5 text-[10px] leading-snug text-ink-500">{gap.reason}</p>
		{#if gap.suggestedFix}
			<p class="mt-0.5 flex items-start gap-1 text-[10px] leading-snug text-brand-600">
				<Icon name="arrow-right" size={10} class="mt-0.5 shrink-0" />
				<span class="min-w-0">{gap.suggestedFix}</span>
			</p>
		{/if}
	</li>
{/snippet}

{#snippet nameList(label: string, items: readonly string[], icon: 'grid' | 'cpu' | 'check')}
	<div>
		<p class="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-ink-400">
			<Icon name={icon} size={10} />
			{label} · {items.length}
		</p>
		<div class="flex flex-wrap gap-1">
			{#each items as name, i (label + i)}
				<span class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-700">{name}</span>
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
				class="mt-1.5 size-1.5 shrink-0 rounded-full {step.severity === 'critical'
					? 'bg-danger-500'
					: 'bg-warning-500'}"
			></span>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] leading-snug text-ink-700">{step.message}</span>
				{#if step.targetKind !== 'feature'}
					<span class="mt-0.5 block truncate text-[10px] text-ink-400">
						{step.targetKind} · {step.target} · {step.area}
					</span>
				{/if}
			</span>
			<Icon name="arrow-right" size={11} class="mt-1 shrink-0 text-ink-300" />
		</button>
	</li>
{/snippet}

<style>
	/* Typography for the sanitized digest injected via {@html}, sized for the
	   drawer (the file viewer's own scale is a full page). */
	.md-digest :global(h2),
	.md-digest :global(h3) {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-400, #94a3b8);
		margin: 0.9em 0 0.4em;
	}
	.md-digest :global(h2:first-child),
	.md-digest :global(h3:first-child) {
		margin-top: 0;
	}
	.md-digest :global(p),
	.md-digest :global(ul),
	.md-digest :global(ol),
	.md-digest :global(blockquote) {
		margin: 0.45em 0;
	}
	.md-digest :global(ul),
	.md-digest :global(ol) {
		padding-left: 1.1em;
		list-style: disc;
	}
	.md-digest :global(li) {
		margin: 0.2em 0;
	}
	.md-digest :global(li)::marker {
		color: var(--color-ink-300, #cbd5e1);
	}
	.md-digest :global(strong) {
		font-weight: 600;
		color: var(--color-ink-900, #0f172a);
	}
	.md-digest :global(blockquote) {
		border-left: 2px solid var(--color-line, #e2e8f0);
		padding-left: 0.6em;
		color: var(--color-ink-500, #64748b);
	}
	.md-digest :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.92em;
	}
</style>
