<script lang="ts">
	import {
		Icon,
		SearchInput,
		matchesQuery,
		MATURITY_STAGES,
		MATURITY_STAGE_COUNT,
		stageFromTrl,
		stageLabel,
		trlOfStage
	} from '$ui/design-system';
	import {
		CORE_TONES,
		familiesDirectlyUnderCore,
		featuresDirectlyUnderCore,
		featuresDirectlyUnderFamily,
		subFamiliesOf,
		type CoreTone,
		type Family,
		type Feature
	} from '$domain/features';
	import type { FeatureAdvice, FeatureImplementationCoverage } from '$application/use-cases';
	import type { FeatureAction, FeatureActionIndex } from '$application/index-feature-actions';
	import type { Collaborator } from '$domain/team/team';
	import type { WorkTarget } from '$domain/features';
	import type { FeaturesStore } from '../draft-store.svelte';
	import { coreToneForDisplay, coreToneStyle } from '../core-colors';
	import { unspaActionHref, unspaActionPath } from '../unspa-dashboard-url';
	import AdvisorBadge from '../AdvisorBadge.svelte';
	import ImplementationBadge from '../ImplementationBadge.svelte';
	import AssigneeChip from '../AssigneeChip.svelte';
	import ContributorPicker from '../ContributorPicker.svelte';
	import FlagButton from '../FlagButton.svelte';

	interface Props {
		store: FeaturesStore;
		advice: FeatureAdvice[];
		/** Authored actions per leaf, from the behavior kernel (read-only). */
		featureActions: FeatureActionIndex;
		/** In-process maturity % per leaf (the readiness dimension's own numbers):
		    the maturity badge falls back to it while the engine advice is still
		    empty, so a freshly authored project shows its stage without waiting
		    for the background advisor refresh. */
		maturity?: ReadonlyMap<string, number>;
		/** Per-leaf code-implementation coverage (adoption sidecar); a leaf absent
		    from the map simply shows no chip. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
		/** Team members — an action's owner and the contributors a feature/action carries. */
		collaborators: Collaborator[];
		/** Behavior-editor base URL, for the dedicated "open in a new tab" icon only. */
		unspaBaseUrl?: string | null;
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor?: (path?: string | null) => void;
	}
	let {
		store,
		advice,
		featureActions,
		maturity = new Map(),
		implementation = new Map(),
		collaborators,
		unspaBaseUrl = null,
		onOpenEditor
	}: Props = $props();

	/* Where an action opens. Clicking its name stays INSIDE Lyriks: the Behavior
	   tab's embedded editor, on the action itself (its surface selected and its
	   own card expanded) rather than on the surface that merely hosts it. The
	   separate icon beside it is the only thing that leaves for a dedicated tab,
	   and it is null when no editor URL is configured. */
	const actionPath = (featureId: string, action: FeatureAction): string =>
		unspaActionPath(featureId, action.surfaceId, action.id);
	const actionHref = (featureId: string, action: FeatureAction): string | null =>
		unspaActionHref(featureId, action.surfaceId, action.id, unspaBaseUrl);

	// Work-queue helpers, shared by the core / feature / action rows. A target is
	// "queued" when an assignment exists for it; assigning implicitly queues it.
	const assigneeOf = (target: WorkTarget): string | null =>
		store.getAssignment(target)?.assigneeId ?? null;
	const isQueued = (target: WorkTarget): boolean => !!store.getAssignment(target);

	/* Expanded action lists by feature id — collapsed by default so the tree
	   still reads as a tree; a chevron opens the feature's actions. */
	let expanded = $state<Record<string, boolean>>({});
	const toggleExpand = (id: string) => (expanded[id] = !expanded[id]);

	/* Search over the whole tree. It is the densest screen in the product (cores
	   by families by features by actions), so it filters live rather than making
	   the reader scroll. The rule is "keep the path to every hit": a feature
	   stays when it or one of its actions matches, a family stays when it
	   matches or still holds a surviving feature, a core stays when anything
	   under it survives. Matching a CONTAINER (a core or family name) shows
	   everything inside it, because searching "Billing" means "show me Billing",
	   not "show me the one row whose own name repeats the word". */
	let search = $state('');
	const searching = $derived(search.trim().length > 0);

	const actionsOf = (featureId: string): FeatureAction[] => featureActions[featureId] ?? [];
	/** Actions of a feature narrowed to the query; the full list when not searching. */
	function visibleActions(featureId: string, inherited: boolean): FeatureAction[] {
		const all = actionsOf(featureId);
		if (!searching || inherited) return all;
		const hits = all.filter((a) => matchesQuery(search, a.name, a.intent, a.surfaceName));
		return hits.length > 0 ? hits : all;
	}
	const featureHit = (feat: Feature): boolean =>
		matchesQuery(search, feat.name, feat.description) ||
		actionsOf(feat.id).some((a) => matchesQuery(search, a.name, a.intent, a.surfaceName));
	function familyHit(family: Family): boolean {
		if (matchesQuery(search, family.name, family.description)) return true;
		return (
			featuresDirectlyUnderFamily(store.draft, family.id).some(featureHit) ||
			subFamiliesOf(store.draft, family.id).some(familyHit)
		);
	}
	/** Features/families of a container, filtered unless the container itself matched. */
	const keepFeatures = (list: Feature[], inherited: boolean): Feature[] =>
		!searching || inherited ? list : list.filter(featureHit);
	const keepFamilies = (list: Family[], inherited: boolean): Family[] =>
		!searching || inherited ? list : list.filter(familyHit);

	/** How many leaves survive the query, for the "n of m" readout. */
	const matchCount = $derived(
		searching ? store.draft.features.filter(featureHit).length : store.draft.features.length
	);

	const adviceByFeature = $derived(new Map(advice.map((a) => [a.featureId, a])));

	/* ── drag-and-drop state ──────────────────────────────────────────────
	   `dragId` is the feature being dragged; `overZone` is the id of the drop
	   target currently under the cursor (for the highlight ring). Zones are
	   namespaced: `feat:<id>` (reorder/adopt), `fam:<id>` (join family),
	   `core:<id>` (leave family → core root). */
	let dragId = $state<string | null>(null);
	let overZone = $state<string | null>(null);

	/* ── row/family actions dropdown ──────────────────────────────────────
	   A single open-menu id (`feat:<id>` or `fam:<id>`); a window click closes
	   it. Menu buttons stopPropagation so opening one doesn't immediately
	   re-close it via the window handler. */
	let openMenu = $state<string | null>(null);
	const toggleMenu = (key: string) => (openMenu = openMenu === key ? null : key);

	/* Collapsed families by id — default expanded; a chevron toggles each. */
	let collapsed = $state<Record<string, boolean>>({});
	const toggleCollapse = (id: string) => (collapsed[id] = !collapsed[id]);

	/* Layout: `card` reflows cores into a multi-column grid; `list` stacks them
	   in a single column (roomier for reading long trees). Pure view state. */
	let view = $state<'card' | 'list'>('card');

	/* Release chip tone by version — mirrors the mockup's roadmap colours
	   (MVP green, V1 blue, V2 brand/violet). Unknown versions fall back. */
	const RELEASE_TONE: Record<string, string> = {
		MVP: 'bg-success-50 text-success-600',
		V1: 'bg-info-50 text-info-600',
		V2: 'bg-brand-50 text-brand-600'
	};
	const releaseTone = (v: string): string => RELEASE_TONE[v] ?? 'bg-surface-sunken text-ink-600';

	// Per-action maturity text tone: early stage = shallow (red), top stages =
	// deeply specified (green).
	const stageActionTone = (l: number): string =>
		l >= 4 ? 'text-success-600' : l >= 2 ? 'text-warning-600' : 'text-danger-500';

	// Release pickers (feature & action) with an inline "＋ New release" that
	// creates one on the fly and assigns it — so you never have to leave for the
	// Roadmap tab to schedule something.
	const newReleaseId = (): string => {
		const n = store.draft.releases.length + 1;
		return store.addRelease({ name: `V${n}`, version: `v${n}.0` });
	};
	function pickFeatureRelease(featureId: string, value: string) {
		if (value === '__new__') store.assignFeatureToRelease(featureId, newReleaseId());
		else if (value === '') store.unassignFeatureFromRelease(featureId);
		else store.assignFeatureToRelease(featureId, value);
	}
	function pickActionRelease(featureId: string, actionId: string, value: string) {
		if (value === '__new__') store.setActionRelease(featureId, actionId, newReleaseId());
		else store.setActionRelease(featureId, actionId, value || null);
	}

	/* The core icon carries the colour (the mockup has no tone dropdown) — clicking it
	   cycles through the tone palette. */
	const cycleTone = (id: string, tone: CoreTone) => {
		const codes = CORE_TONES.map((t) => t.code);
		const next = codes[(codes.indexOf(tone) + 1) % codes.length];
		store.updateCore(id, 'tone', next);
	};

	function startDrag(e: DragEvent, id: string) {
		dragId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', id);
		}
	}
	function endDrag() {
		dragId = null;
		overZone = null;
	}
	/** Allow a drop on `zone` (preventDefault is required for `drop` to fire). */
	function over(e: DragEvent, zone: string, stop = false) {
		if (!dragId) return;
		e.preventDefault();
		if (stop) e.stopPropagation();
		overZone = zone;
	}
	function leave(zone: string) {
		if (overZone === zone) overZone = null;
	}
	function dropOnFeature(e: DragEvent, targetId: string) {
		e.preventDefault();
		e.stopPropagation();
		if (dragId) store.reorderFeatureBefore(dragId, targetId);
		endDrag();
	}
	function dropOnFamily(e: DragEvent, family: Family) {
		e.preventDefault();
		e.stopPropagation();
		if (dragId) store.moveFeature(dragId, family.coreId, family.id);
		endDrag();
	}
	function dropOnCoreRoot(e: DragEvent, coreId: string) {
		e.preventDefault();
		if (dragId) store.moveFeature(dragId, coreId, null);
		endDrag();
	}

	const toneText = (tone: CoreTone) => coreToneStyle(tone).text;
</script>

<!-- Click anywhere closes an open row/family actions menu. -->
<svelte:window onclick={() => (openMenu = null)} />

<!-- @container so core cards reflow to the tree column width, not the viewport. -->
<div class="@container" data-anchor="feature-tree">
<!-- View toggle: swap the core grid between multi-column cards and a single-column list. -->
<div class="mb-3 flex flex-wrap items-center justify-end gap-2">
	<SearchInput
		bind:value={search}
		placeholder="Search a core, family, feature or action…"
		class="mr-auto w-full max-w-sm"
		resultLabel="{matchCount} of {store.draft.features.length} features"
	/>
	<span class="mr-1 text-[10px] font-semibold uppercase tracking-widest text-ink-400">View</span>
	<button
		type="button"
		onclick={() => (view = 'card')}
		aria-pressed={view === 'card'}
		title="Card view"
		class="grid size-7 place-items-center rounded-lg transition-colors {view === 'card'
			? 'bg-surface-sunken text-ink-900'
			: 'text-ink-400 hover:bg-surface-sunken hover:text-ink-700'}"
	>
		<Icon name="grid" size={13} />
	</button>
	<button
		type="button"
		onclick={() => (view = 'list')}
		aria-pressed={view === 'list'}
		title="List view"
		class="grid size-7 place-items-center rounded-lg transition-colors {view === 'list'
			? 'bg-surface-sunken text-ink-900'
			: 'text-ink-400 hover:bg-surface-sunken hover:text-ink-700'}"
	>
		<Icon name="layers" size={13} />
	</button>
</div>
<div class="grid gap-4 {view === 'list' ? 'grid-cols-1' : '@2xl:grid-cols-2'}">
	{#each store.draft.cores as core, i (core.id)}
		<!-- `coreMatched` = the core's own name/description matched, so everything
		     under it renders unfiltered (see the search block above). -->
		{@const coreMatched = matchesQuery(search, core.name, core.description)}
		{@const features = keepFeatures(featuresDirectlyUnderCore(store.draft, core.id), coreMatched)}
		{@const families = keepFamilies(familiesDirectlyUnderCore(store.draft, core.id), coreMatched)}
		{@const leafCount = store.draft.features.filter((f) => f.coreId === core.id).length}
		{@const coreEmpty = leafCount === 0 && familiesDirectlyUnderCore(store.draft, core.id).length === 0}
		{@const hiddenByQuery = searching && !coreMatched && features.length === 0 && families.length === 0}
		{#if !hiddenByQuery}
		{@const tone = coreToneForDisplay(core.tone, i)}
		{@const style = coreToneStyle(tone)}
		{@const coreTarget = { kind: 'core', coreId: core.id } as WorkTarget}
		<!-- Whole-card core drop target: dropping anywhere on the card re-homes the
		     feature to the core root (detached from any family). Feature/family
		     zones stopPropagation, so nesting drops still win over this. -->
		<div
			role="group"
			aria-label={core.name || 'core'}
			data-anchor={core.id}
			ondragover={(e) => over(e, `core:${core.id}`)}
			ondragleave={() => leave(`core:${core.id}`)}
			ondrop={(e) => dropOnCoreRoot(e, core.id)}
			class="group/dom relative rounded-card border p-4 {style.card}"
		>
			{#if dragId && overZone === `core:${core.id}`}
				<div
					class="pointer-events-none absolute inset-0 z-30 flex items-start justify-center rounded-card border-2 border-dashed border-current {style.text}"
				>
					<span
						class="mt-2 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold shadow-card {style.text}"
					>
						Drop to move into {core.name || 'core'}
					</span>
				</div>
			{/if}
			<!-- Hover toolbar: quick-add a leaf or a family, plus delete (only when the
			     core is empty - otherwise a lock signals it must be emptied first). -->
			<div
				class="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/dom:opacity-100"
			>
				<button
					type="button"
					title="Add a feature"
					onclick={() => store.addFeatureToCore(core.id, 'Feature')}
					class="flex items-center gap-1 rounded-field px-2 py-1 text-[10px] font-semibold {style.soft} hover:brightness-95"
				>
					<Icon name="plus" size={10} /> Feature
				</button>
				<button
					type="button"
					title="Group into a family"
					onclick={() => store.addFamilyToCore(core.id, { name: 'New family' })}
					class="flex items-center gap-1 rounded-field bg-surface-sunken px-2 py-1 text-[10px] font-semibold text-ink-500 hover:text-brand-600"
				>
					<Icon name="plus" size={10} /> Family
				</button>
				{#if coreEmpty}
					<button
						type="button"
						onclick={() => store.removeCore(core.id)}
						class="grid size-6 place-items-center rounded-md bg-danger-50 text-danger-500 hover:bg-danger-100"
						aria-label="Delete empty core"
						title="Delete this empty core"
					>
						<Icon name="x" size={12} />
					</button>
				{:else}
					<span
						class="grid size-6 cursor-not-allowed place-items-center rounded-md bg-surface-sunken text-ink-300"
						title="Cannot delete - this core still contains features or families. Empty it first."
					>
						<Icon name="lock" size={11} />
					</span>
				{/if}
			</div>

			<div class="flex items-center gap-2.5">
				<button
					type="button"
					onclick={() => cycleTone(core.id, core.tone)}
					class="grid size-8 shrink-0 place-items-center rounded-lg {style.icon}"
					title="Click to change colour"
					aria-label="Change core colour"
				>
					<Icon name="grid" size={14} />
				</button>
				<input
					type="text"
					value={core.name}
					oninput={(e) => store.updateCore(core.id, 'name', e.currentTarget.value)}
					placeholder="Core name"
					class="min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-bold text-ink-900 outline-none placeholder:text-ink-300 focus:outline-none"
				/>
				<!-- Assign / queue the whole core (a "core feature") to a member. -->
				<FlagButton queued={isQueued(coreTarget)} onToggle={() => store.toggleQueued(coreTarget)} />
				<AssigneeChip
					assigneeId={assigneeOf(coreTarget)}
					{collaborators}
					onPick={(id) => store.assignWorkItem(coreTarget, id)}
					compact
				/>
			</div>
			<p class="mt-0.5 text-[11px] text-ink-400">
				{leafCount}
				{leafCount === 1 ? 'leaf' : 'leaves'} · drag to nest, only leaves can be detailed
			</p>
			{#if core.description}
				<p class="mt-1 text-xs text-ink-500">{core.description}</p>
			{/if}

			<!-- Feature/family list. Re-homing to the core root is handled by the whole
			     card (see the outer drop target above), so this is a plain container. -->
			<div role="list" class="mt-4 space-y-2">
				{#each features as feat (feat.id)}
					{@render featureRow(feat, tone, coreMatched)}
				{/each}
				{#each families as family (family.id)}
					{@render renderFamily(family, tone, coreMatched)}
				{/each}
			</div>

			{#if coreEmpty}
				<button
					type="button"
					onclick={() => store.addFeatureToCore(core.id, 'Feature')}
					class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-line px-2 py-2 text-xs font-medium {style.text} hover:border-current"
				>
					<Icon name="plus" size={12} /> First feature
				</button>
			{/if}
		</div>
		{/if}
	{/each}

	<!-- New core placeholder. Hidden while a query is active: it is an authoring
	     affordance, and rendering it beside filtered results reads as a result. -->
	{#if !searching}
	<button
		type="button"
		onclick={() => store.addCore()}
		class="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-surface p-8 text-ink-400 transition-colors hover:border-brand-300 hover:bg-brand-50/30 hover:text-brand-500"
	>
		<Icon name="plus" size={22} />
		<span class="text-sm font-medium">New core</span>
	</button>
	{/if}
</div>

{#if searching && matchCount === 0}
	<p class="py-10 text-center text-sm text-ink-500">
		Nothing in the tree matches the search.
	</p>
{/if}
</div>

{#snippet featureRow(feat: Feature, tone: CoreTone, inherited = false)}
	{@const featureAdvice = adviceByFeature.get(feat.id)}
	{@const isSelected = store.selectedFeatureId === feat.id}
	{@const relId = store.getReleaseAssignment(feat.id)}
	{@const rel = relId ? store.draft.releases.find((r) => r.id === relId) : null}
	{@const actions = visibleActions(feat.id, inherited)}
	<!-- A query that only hit inside the actions opens the row on its own, so the
	     match is visible instead of hidden behind a collapsed chevron. -->
	{@const hitInActions =
		searching && !inherited && !matchesQuery(search, feat.name, feat.description)}
	{@const isExpanded = hitInActions || !!expanded[feat.id]}
	{@const featTarget = { kind: 'feature', featureId: feat.id } as WorkTarget}
	{@const manualTrl = store.getLeafMeta(feat.id).trl ?? null}
	<div
		role="listitem"
		data-anchor={feat.id}
		draggable="true"
		ondragstart={(e) => startDrag(e, feat.id)}
		ondragend={endDrag}
		ondragover={(e) => over(e, `feat:${feat.id}`, true)}
		ondragleave={() => leave(`feat:${feat.id}`)}
		ondrop={(e) => dropOnFeature(e, feat.id)}
		class="rounded-field border text-sm transition-all {coreToneStyle(tone)
			.feature} {dragId === feat.id ? 'opacity-40' : ''} {overZone === `feat:${feat.id}`
			? 'ring-2 ring-brand-400'
			: isSelected
				? 'ring-2 ring-brand-300'
				: ''}"
	>
	<div class="flex items-center gap-2 px-3 py-2">
		{#if actions.length > 0}
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					toggleExpand(feat.id);
				}}
				class="grid size-4 shrink-0 place-items-center text-ink-400 hover:text-ink-700"
				aria-expanded={isExpanded}
				aria-label={isExpanded ? 'Hide actions' : 'Show actions'}
				title="{actions.length} {actions.length === 1 ? 'action' : 'actions'}"
			>
				<Icon
					name="chevron-right"
					size={12}
					class="transition-transform {isExpanded ? 'rotate-90' : ''}"
				/>
			</button>
		{:else}
			<span class="size-4 shrink-0"></span>
		{/if}
		<span
			class="shrink-0 cursor-grab {toneText(tone)} active:cursor-grabbing"
			title="Drag to reorder or move"
		>
			<Icon name="bolt" size={13} />
		</span>
		<input
			type="text"
			value={feat.name}
			oninput={(e) => store.updateFeature(feat.id, 'name', e.currentTarget.value)}
			placeholder="Feature name"
			class="min-w-[3rem] flex-1 truncate border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:outline-none"
		/>
		<span class="relative flex shrink-0 items-center {view === 'list' ? 'w-24' : ''}" title="Set release">
			{#if rel}
				<span
					class="inline-flex max-w-full items-center gap-1 truncate rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider {releaseTone(
						rel.name || rel.version
					)}"
				>
					<Icon name="tag" size={9} /> {rel.name || rel.version}
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-400"
				>
					<Icon name="clock" size={9} /> none
				</span>
			{/if}
			<select
				value={relId ?? ''}
				onchange={(e) => pickFeatureRelease(feat.id, e.currentTarget.value)}
				aria-label="Set feature release"
				class="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="">No release</option>
				{#each store.draft.releases as r (r.id)}<option value={r.id}>{r.name || r.version}</option
					>{/each}
				<option value="__new__">＋ New release</option>
			</select>
		</span>
		<span
			class="relative flex shrink-0 items-center {view === 'list' ? 'w-44' : ''}"
			title="Set spec maturity"
		>
			<AdvisorBadge
				summary={featureAdvice?.summary ?? null}
				score={featureAdvice?.score ?? null}
				gaps={featureAdvice?.gaps ?? []}
				{manualTrl}
				fallbackPercentage={maturity.get(feat.id) ?? null}
			/>
			<!-- Invisible native picker overlaid on the badge: click the badge to set
			     the stage by hand (or back to Auto = engine-computed). Overrides keep
			     the legacy 1-9 storage via each stage's representative rung. -->
			<select
				value={manualTrl == null ? '' : trlOfStage(stageFromTrl(manualTrl))}
				onchange={(e) =>
					store.setLeafTrl(feat.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
				aria-label="Set feature spec maturity"
				class="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="">Auto (computed)</option>
				{#each MATURITY_STAGES as s (s.level)}<option value={trlOfStage(s.level)}
						>{s.level}/{MATURITY_STAGE_COUNT} · {s.label}</option
					>{/each}
			</select>
		</span>
		<!-- Code coverage of the spec, from the last adoption sync. The badge only
		     renders when a score exists; a never-adopted feature shows nothing. -->
		<ImplementationBadge coverage={implementation.get(feat.id)} />
		<ContributorPicker
			selectedIds={store.getFeatureContributors(feat.id)}
			people={collaborators}
			onToggle={(personId) => store.toggleFeatureContributor(feat.id, personId)}
			compact
		/>
		<FlagButton queued={isQueued(featTarget)} onToggle={() => store.toggleQueued(featTarget)} />
		<AssigneeChip
			assigneeId={assigneeOf(featTarget)}
			{collaborators}
			onPick={(id) => store.assignWorkItem(featTarget, id)}
			compact
		/>
		<button
			type="button"
			onclick={(e) => {
				e.stopPropagation();
				store.selectFeature(feat.id);
			}}
			class="shrink-0 rounded p-0.5 {isSelected
				? 'text-brand-500'
				: 'text-ink-400'} hover:bg-surface-sunken hover:text-ink-700"
			aria-label="Open feature details"
			title="Open details"
		>
			<Icon name="ellipsis" size={14} />
		</button>
	</div>

	{#if isExpanded && actions.length > 0}
		<!-- What a user can actually do in this feature, each hand-able to a member. -->
		<div class="space-y-1 border-t border-line/70 px-3 py-2">
			{#each actions as action (action.id)}
				{@render actionRow(feat.id, action)}
			{/each}
		</div>
	{/if}
	</div>
{/snippet}

{#snippet actionRow(featureId: string, action: FeatureAction)}
	{@const target = { kind: 'action', featureId, actionId: action.id } as WorkTarget}
	{@const href = actionHref(featureId, action)}
	{@const aTrl = store.getActionTrl(featureId, action.id)}
	{@const aStage = aTrl == null ? null : stageFromTrl(aTrl)}
	{@const aRel = store.getActionRelease(featureId, action.id)}
	{@const aRelObj = aRel ? store.draft.releases.find((r) => r.id === aRel) : null}
	<div class="group/act flex items-center gap-2 rounded-field py-1 hover:bg-surface/70">
		<Icon name="chevron-right" size={11} class="shrink-0 text-ink-300" />
		{#if onOpenEditor}
			<button
				type="button"
				onclick={() => onOpenEditor(actionPath(featureId, action))}
				class="min-w-0 flex-1 truncate text-left text-xs text-ink-700 hover:text-brand-600 hover:underline"
				title={action.intent || action.name}
			>
				{action.name}
			</button>
		{:else}
			<span class="min-w-0 flex-1 truncate text-xs text-ink-700" title={action.intent || action.name}>
				{action.name}
			</span>
		{/if}
		{#if href}
			<a
				{href}
				target="_blank"
				rel="noopener noreferrer"
				title="Open in a dedicated tab"
				aria-label="Open {action.name} in a dedicated tab"
				class="shrink-0 text-ink-400 opacity-0 transition-opacity hover:text-brand-600 focus-visible:opacity-100 group-hover/act:opacity-100"
			>
				<Icon name="external-link" size={10} />
			</a>
		{/if}
		<!-- Where it happens. The word "surface" never reaches the screen. -->
		<span
			class="hidden shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-medium text-ink-500 @sm:inline"
			title="Happens in {action.surfaceName}"
		>
			{action.surfaceName}
		</span>
		<span class="relative flex shrink-0 items-center {view === 'list' ? 'w-24' : ''}" title="Set release">
			{#if aRelObj}
				<span
					class="inline-flex max-w-full items-center gap-1 truncate rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider {releaseTone(
						aRelObj.name || aRelObj.version
					)}"
				>
					<Icon name="tag" size={9} /> {aRelObj.name || aRelObj.version}
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-ink-400"
				>
					<Icon name="clock" size={9} /> none
				</span>
			{/if}
			<select
				value={aRel ?? ''}
				onchange={(e) => pickActionRelease(featureId, action.id, e.currentTarget.value)}
				aria-label="Action release"
				class="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="">No release</option>
				{#each store.draft.releases as rel (rel.id)}<option value={rel.id}>{rel.name || rel.version}</option
					>{/each}
				<option value="__new__">＋ New release</option>
			</select>
		</span>
		<span
			class="relative flex shrink-0 items-center {view === 'list' ? 'w-44' : ''}"
			title="Set spec maturity"
		>
			<span
				class="inline-flex min-w-0 max-w-full items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10px] font-semibold {aStage
					? stageActionTone(aStage)
					: 'text-ink-400'}"
			>
				<span class="size-1.5 shrink-0 rounded-full bg-current"></span>
				<span class="truncate">{aStage ? stageLabel(aStage) : '-'}</span>
			</span>
			<select
				value={aTrl == null ? '' : trlOfStage(stageFromTrl(aTrl))}
				onchange={(e) =>
					store.setActionTrl(featureId, action.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
				aria-label="Action spec maturity"
				class="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="">Not set</option>
				{#each MATURITY_STAGES as s (s.level)}<option value={trlOfStage(s.level)}
						>{s.level}/{MATURITY_STAGE_COUNT} · {s.label}</option
					>{/each}
			</select>
		</span>
		<!-- Code coverage of this action's own spec slice; renders only when the
		     last adoption sync reported this action. -->
		<ImplementationBadge coverage={implementation.get(featureId)?.actions?.[action.id]} />
		<ContributorPicker
			selectedIds={store.getActionContributors(featureId, action.id)}
			people={collaborators}
			onToggle={(personId) => store.toggleActionContributor(featureId, action.id, personId)}
			compact
		/>
		<FlagButton queued={isQueued(target)} onToggle={() => store.toggleQueued(target)} />
		<AssigneeChip
			assigneeId={assigneeOf(target)}
			{collaborators}
			onPick={(id) => store.assignWorkItem(target, id)}
			compact
		/>
		<span class="size-[18px] shrink-0" aria-hidden="true"></span>
	</div>
{/snippet}

{#snippet renderFamily(family: Family, tone: CoreTone, inherited = false)}
	{@const familyMatched = inherited || matchesQuery(search, family.name, family.description)}
	{@const familyFeatures = keepFeatures(
		featuresDirectlyUnderFamily(store.draft, family.id),
		familyMatched
	)}
	{@const childFamilies = keepFamilies(subFamiliesOf(store.draft, family.id), familyMatched)}
	<!-- Searching force-opens a family: a collapsed one would hide its own hits. -->
	{@const isOpen = searching || !collapsed[family.id]}
	<div
		role="group"
		data-anchor={family.id}
		ondragover={(e) => over(e, `fam:${family.id}`, true)}
		ondragleave={() => leave(`fam:${family.id}`)}
		ondrop={(e) => dropOnFamily(e, family)}
		class="rounded-field border bg-surface-sunken/60 p-2 transition-all {overZone === `fam:${family.id}`
			? 'border-brand-300 ring-2 ring-brand-300'
			: 'border-line'}"
	>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => toggleCollapse(family.id)}
				class="grid size-4 shrink-0 place-items-center text-ink-400 hover:text-ink-700"
				aria-label={isOpen ? 'Collapse family' : 'Expand family'}
			>
				<Icon
					name="chevron-right"
					size={12}
					class="transition-transform {isOpen ? 'rotate-90' : ''}"
				/>
			</button>
			<Icon name="layers" size={13} />
			<input
				type="text"
				value={family.name}
				oninput={(e) => store.updateFamily(family.id, 'name', e.currentTarget.value)}
				placeholder="Family name"
				class="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold text-ink-800 outline-none placeholder:text-ink-400 focus:outline-none"
			/>
			{#if familyFeatures.length + childFamilies.length > 0}
				<span class="shrink-0 text-[9px] tabular-nums text-ink-300">
					{familyFeatures.length + childFamilies.length}
				</span>
			{/if}

			<div class="relative shrink-0">
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						toggleMenu(`fam:${family.id}`);
					}}
					class="rounded p-0.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
					aria-label="Family actions"
				>
					<Icon name="ellipsis" size={14} />
				</button>
				{#if openMenu === `fam:${family.id}`}
					<div
						class="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-lg border border-line bg-surface py-1 shadow-card"
						role="menu"
					>
						<button
							type="button"
							onclick={() => {
								store.addFeatureToFamily(family.id, 'Feature');
								openMenu = null;
							}}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
						>
							<Icon name="sparkles" size={12} class="text-brand-500" /> Add feature
						</button>
						<button
							type="button"
							onclick={() => {
								store.addSubFamily(family.id, { name: 'New sub-family' });
								openMenu = null;
							}}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
						>
							<Icon name="layers" size={12} class="text-ink-500" /> Add family
						</button>
						<div class="my-1 border-t border-line"></div>
						{#if featuresDirectlyUnderFamily(store.draft, family.id).length === 0 && subFamiliesOf(store.draft, family.id).length === 0}
							<button
								type="button"
								onclick={() => {
									store.removeFamily(family.id);
									openMenu = null;
								}}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger-500 hover:bg-danger-50"
							>
								<Icon name="x" size={12} /> Delete
							</button>
						{:else}
							<div
								class="flex items-start gap-2 px-3 py-1.5 text-[11px] text-ink-400"
								title="Empty the family first"
							>
								<Icon name="lock" size={12} /> <span>Delete locked - not empty</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		{#if isOpen}
			<div class="mt-2 space-y-1.5 pl-3">
				{#each familyFeatures as feat (feat.id)}
					{@render featureRow(feat, tone, familyMatched)}
				{/each}

				{#if familyFeatures.length === 0 && childFamilies.length === 0 && !searching}
					<p class="py-1 text-[11px] text-ink-300">Empty family. Add a Family or a Feature.</p>
				{/if}

				{#each childFamilies as child (child.id)}
					{@render renderFamily(child, tone, familyMatched)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
