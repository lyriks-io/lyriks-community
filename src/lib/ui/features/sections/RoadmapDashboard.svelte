<script lang="ts">
	import { Icon, SearchInput, confirmDialog, matchesQuery } from '$ui/design-system';
	import {
		leafFeatures,
		releaseAllDone,
		releaseLifecycle,
		releaseLabel,
		releaseProgress,
		featuresOfRelease as releaseFeatures,
		type CoreTone,
		type LeafMeta
	} from '$domain/features';
	import {
		planStatusUpgrades,
		type FeatureImplementationCoverage
	} from '$application/use-cases';
	import type { FeatureActionIndex } from '$application/index-feature-actions';
	import type { Collaborator } from '$domain/team/team';
	import type { FeaturesStore } from '../draft-store.svelte';
	import AssigneeChip from '../AssigneeChip.svelte';
	import ImplementationBadge from '../ImplementationBadge.svelte';
	import SprintChip from '../SprintChip.svelte';
	import SearchPicker, { type PickerOption } from '../SearchPicker.svelte';
	import SprintsPanel from './SprintsPanel.svelte';
	import WorkQueueBoard from './WorkQueueBoard.svelte';

	interface Props {
		store: FeaturesStore;
		/** Team members work can be handed to. */
		collaborators: Collaborator[];
		/** Authored actions per leaf (read-only, from the kernel) — for the work queue. */
		featureActions: FeatureActionIndex;
		/** Per-leaf code-implementation coverage from the adoption sidecar. Empty
		 *  when the engine is off or nothing was adopted; all chips stay hidden. */
		implementation?: ReadonlyMap<string, FeatureImplementationCoverage>;
	}
	let { store, collaborators, featureActions, implementation = new Map() }: Props = $props();

	// Record view of the coverage map, for the shared domain planner.
	const coverageByFeature = $derived(Object.fromEntries(implementation));
	/** Statuses the recorded coverage justifies raising (same rules as the
	 *  server-side reconcile: upgrade-only, a hand-set done is respected). */
	const pendingUpgrades = $derived(planStatusUpgrades(store.draft, coverageByFeature));

	/** Apply the pending upgrades through the normal store mutators (autosave path). */
	function syncStatusesFromCode() {
		const upgrades = pendingUpgrades;
		for (const change of upgrades) {
			store.updateLeafMeta(change.featureId, { status: change.to });
		}
		const named = upgrades
			.slice(0, 3)
			.map((c) => `"${store.draft.features.find((f) => f.id === c.featureId)?.name || 'Untitled feature'}"`)
			.join(', ');
		const rest = upgrades.length - Math.min(upgrades.length, 3);
		store.notifier.notify(
			'info',
			`${named}${rest > 0 ? ` and ${rest} more` : ''}: status raised to match the code.`
		);
	}

	const sprints = $derived([...(store.draft.sprints ?? [])].sort((a, b) => a.order - b.order));

	let selectedReleaseId = $state<string | null>(null);

	const allLeaves = $derived(leafFeatures(store.draft));
	const assigned = $derived(
		new Set(store.draft.roadmapAssignments.map((r) => r.featureId))
	);
	const backlog = $derived(allLeaves.filter((f) => !assigned.has(f.id)));

	/** Releases in schedule order (by `order`), the basis for the shipped split. */
	const orderedReleases = $derived(
		[...store.draft.releases].sort((a, b) => a.order - b.order)
	);

	/** Shipped = explicitly archived (stable), or all leaves done (derived, still
	    un-pinned). Everything else stays in the upcoming strip. Selecting a card
	    only opens its detail below — it never reclassifies (and so never removes)
	    other release cards. */
	const shippedReleases = $derived(
		orderedReleases.filter((rel) => Boolean(rel.archivedAt) || allDone(rel.id))
	);
	const upcomingReleases = $derived(
		orderedReleases.filter((rel) => !rel.archivedAt && !allDone(rel.id))
	);
	// Detail edits only what is still on the board; shipped releases are managed
	// from the timeline (pin / reopen), not silently editable here.
	const selectedRelease = $derived(
		(selectedReleaseId
			? upcomingReleases.find((r) => r.id === selectedReleaseId)
			: null) ??
			upcomingReleases[0] ??
			null
	);

	const featuresInSelected = $derived(
		selectedRelease ? featuresOfRelease(selectedRelease.id) : []
	);

	/** What the release detail's "Add feature" offers: every leaf not already in
	 *  this release. A leaf scheduled elsewhere is offered too (picking it moves
	 *  it), labelled with where it sits now. */
	const addFeatureOptions = $derived.by((): PickerOption[] => {
		if (!selectedRelease) return [];
		const releaseOf = new Map(store.draft.roadmapAssignments.map((r) => [r.featureId, r.releaseId]));
		const versionOf = new Map(store.draft.releases.map((r) => [r.id, r.version || r.name || 'release']));
		return allLeaves
			.filter((f) => releaseOf.get(f.id) !== selectedRelease.id)
			.map((f) => {
				const rel = releaseOf.get(f.id);
				return {
					key: f.id,
					label: f.name || 'Untitled feature',
					icon: 'bolt' as const,
					hint: [coreOf(f.id)?.name ?? null, rel ? `now in ${versionOf.get(rel) ?? 'a release'}` : 'Backlog']
						.filter(Boolean)
						.join(' · ')
				};
			});
	});

	function addFeatureToSelected(featureId: string) {
		if (!selectedRelease) return;
		store.assignFeatureToRelease(featureId, selectedRelease.id);
	}

	/** Removing a release unschedules its features (they return to the backlog);
	 *  nothing is deleted from the tree, and owners/sprints are kept. */
	async function removeSelectedRelease() {
		const rel = selectedRelease;
		if (!rel) return;
		const n = featuresOfRelease(rel.id).length;
		const ok = await confirmDialog({
			title: `Remove release ${releaseLabel(rel)}?`,
			message:
				n === 0
					? 'It has no feature scheduled. The release card disappears from the roadmap.'
					: `Its ${n} feature${n === 1 ? '' : 's'} go back to the backlog. Nothing is deleted from the feature tree, and their owners and sprints are kept.`,
			confirmLabel: 'Remove release',
			danger: true
		});
		if (!ok) return;
		store.removeRelease(rel.id);
		selectedReleaseId = null;
	}

	const CORE_PILL: Record<CoreTone, { eyebrow: string; bg: string }> = {
		customer: { eyebrow: 'text-info-500', bg: 'bg-info-50' },
		engagement: { eyebrow: 'text-info-500', bg: 'bg-info-50' },
		invoicing: { eyebrow: 'text-brand-500', bg: 'bg-brand-50' },
		content: { eyebrow: 'text-brand-500', bg: 'bg-brand-50' },
		payment: { eyebrow: 'text-danger-500', bg: 'bg-danger-50' },
		commerce: { eyebrow: 'text-danger-500', bg: 'bg-danger-50' },
		dunning: { eyebrow: 'text-warning-500', bg: 'bg-warning-50' },
		operations: { eyebrow: 'text-warning-500', bg: 'bg-warning-50' },
		reporting: { eyebrow: 'text-success-500', bg: 'bg-success-50' },
		insight: { eyebrow: 'text-success-500', bg: 'bg-success-50' },
		custom: { eyebrow: 'text-ink-500', bg: 'bg-surface-sunken' }
	};

	// Feature workflow status → color, mirroring the prototype's status swatches
	// (white/neutral → ink, amber → warning, mint → success).
	type LeafStatus = NonNullable<LeafMeta['status']>;
	const STATUS_ORDER: readonly LeafStatus[] = ['backlog', 'in-progress', 'done'];
	const STATUS_META: Record<LeafStatus, { label: string; text: string; bg: string }> = {
		backlog: { label: 'To do', text: 'text-ink-500', bg: 'bg-surface-sunken' },
		'in-progress': { label: 'In progress', text: 'text-warning-600', bg: 'bg-warning-50' },
		done: { label: 'Done', text: 'text-success-600', bg: 'bg-success-50' }
	};

	function statusOf(featureId: string): LeafStatus {
		return store.getLeafMeta(featureId).status ?? 'backlog';
	}

	// One definition of the roadmap rules for the dashboard, the HTTP API and the
	// MCP: these all delegate to the domain read model in `roadmap.ts`.
	function featuresOfRelease(releaseId: string) {
		return releaseFeatures(store.draft, releaseId);
	}

	function coreOf(featureId: string) {
		const f = store.draft.features.find((f) => f.id === featureId);
		return f ? store.draft.cores.find((c) => c.id === f.coreId) ?? null : null;
	}

	/** Release completion = done leaves / total leaves (0 when empty). */
	function progressOf(releaseId: string): number {
		return releaseProgress(store.draft, releaseId);
	}

	function allDone(releaseId: string): boolean {
		return releaseAllDone(store.draft, releaseId);
	}

	/** Aggregate implementation coverage across a release's features, or null. */
	function releaseCoverage(releaseId: string): { percent: number } | null {
		let found = 0;
		let expected = 0;
		for (const feat of featuresOfRelease(releaseId)) {
			const cov = implementation.get(feat.id);
			if (!cov) continue;
			found += cov.found;
			expected += cov.expected;
		}
		if (expected === 0) return null;
		return { percent: Math.round((found / expected) * 100) };
	}

	/** The claim (status: done) disagrees with the evidence (coverage incomplete). */
	function hasDrift(featureId: string): boolean {
		const cov = implementation.get(featureId);
		return Boolean(cov && statusOf(featureId) === 'done' && cov.found < cov.expected);
	}

	// A distinct accent per release so MVP / V1 / V2 read apart at a glance —
	// keyed by schedule `order` so a release keeps its colour as the list filters.
	const RELEASE_PALETTE = [
		{ badge: 'bg-brand-100 text-brand-700', bar: 'bg-brand-500', tint: 'bg-brand-50/40', border: 'border-brand-200', borderSel: 'border-brand-400', ring: 'ring-brand-100' },
		{ badge: 'bg-info-100 text-info-700', bar: 'bg-info-500', tint: 'bg-info-50/40', border: 'border-info-200', borderSel: 'border-info-400', ring: 'ring-info-100' },
		{ badge: 'bg-warning-100 text-warning-700', bar: 'bg-warning-600', tint: 'bg-warning-50/50', border: 'border-warning-200', borderSel: 'border-warning-400', ring: 'ring-warning-100' },
		{ badge: 'bg-success-100 text-success-700', bar: 'bg-success-600', tint: 'bg-success-50/40', border: 'border-success-200', borderSel: 'border-success-400', ring: 'ring-success-100' },
		{ badge: 'bg-danger-100 text-danger-700', bar: 'bg-danger-500', tint: 'bg-danger-50/40', border: 'border-danger-200', borderSel: 'border-danger-400', ring: 'ring-danger-100' }
	];
	const releaseColor = (order: number) =>
		RELEASE_PALETTE[((order % RELEASE_PALETTE.length) + RELEASE_PALETTE.length) % RELEASE_PALETTE.length];

	/* One search box for the whole roadmap: the release strip, the open
	   release's feature table, the shipped timeline and the backlog all narrow
	   together, because "where is the export feature planned?" is a question
	   about the page, not about one of its four lists. Selection is deliberately
	   NOT filtered: `selectedRelease` still resolves against the unfiltered
	   list, so typing never silently reassigns which release is open. */
	let search = $state('');
	const searching = $derived(search.trim().length > 0);

	const featureMatches = (feat: { id: string; name: string }): boolean =>
		matchesQuery(search, feat.name, coreOf(feat.id)?.name);
	/** A release matches on its own label, or by holding a matching feature. */
	const releaseMatches = (rel: { id: string; name: string; version: string }): boolean =>
		matchesQuery(search, rel.name, rel.version) || featuresOfRelease(rel.id).some(featureMatches);

	const visibleUpcoming = $derived(
		searching ? upcomingReleases.filter(releaseMatches) : upcomingReleases
	);
	const visibleShipped = $derived(
		searching ? shippedReleases.filter(releaseMatches) : shippedReleases
	);
	const visibleBacklog = $derived(searching ? backlog.filter(featureMatches) : backlog);
	/** The open release's rows, narrowed unless the release itself is the hit. */
	const visibleInSelected = $derived(
		searching && selectedRelease && !matchesQuery(search, selectedRelease.name, selectedRelease.version)
			? featuresInSelected.filter(featureMatches)
			: featuresInSelected
	);
	/** Every leaf the query reaches, across the strip, the table and the backlog. */
	const matchCount = $derived(
		searching ? allLeaves.filter(featureMatches).length : allLeaves.length
	);
</script>

<div class="@container space-y-4">
	<!-- Release strip (upcoming / in-flight) -->
	<div class="rounded-card border border-line bg-surface p-5">
		<div class="mb-3 flex items-center justify-between gap-3">
			<div>
				<p class="text-sm font-semibold text-ink-900">Roadmap</p>
				<p class="text-[11px] text-ink-500">
					{store.draft.releases.length} release{store.draft.releases.length === 1 ? '' : 's'} · {assigned.size}
					feature{assigned.size === 1 ? '' : 's'} scheduled · {backlog.length} in the backlog
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<SearchInput
					bind:value={search}
					placeholder="Search a release, feature or core…"
					class="w-full max-w-xs"
					resultLabel="{matchCount} of {allLeaves.length} features"
				/>
				{#if pendingUpgrades.length > 0}
					<button
						type="button"
						onclick={syncStatusesFromCode}
						title="The last code-adoption sync located these features' spec in the code. Raises their status to match (never lowers one)."
						class="inline-flex items-center gap-1.5 rounded-field border border-success-300 bg-success-50 px-3 py-2 text-xs font-semibold text-success-700 hover:shadow-card"
					>
						<span class="font-mono text-[0.9em] leading-none">&lt;/&gt;</span>
						Sync {pendingUpgrades.length} from code
					</button>
				{/if}
			</div>
		</div>

		{#if searching && visibleUpcoming.length === 0 && upcomingReleases.length > 0}
			<p class="rounded-field border border-dashed border-line py-4 text-center text-xs text-ink-400">
				No release on the board matches the search.
			</p>
		{/if}
		<div class="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
			{#each visibleUpcoming as rel (rel.id)}
				{@const isSelected = (selectedRelease?.id ?? null) === rel.id}
				{@const count = featuresOfRelease(rel.id).length}
				{@const pct = progressOf(rel.id)}
				{@const lifecycle = releaseLifecycle(store.draft, rel)}
				{@const cov = releaseCoverage(rel.id)}
				<button
					type="button"
					data-anchor={rel.id}
					onclick={() => (selectedReleaseId = rel.id)}
					class="rounded-card border p-3 text-left transition-all {releaseColor(rel.order).tint} {isSelected
						? `${releaseColor(rel.order).borderSel} ring-2 ${releaseColor(rel.order).ring}`
						: `${releaseColor(rel.order).border} hover:brightness-[0.98]`}"
				>
					<div class="flex items-center justify-between gap-2">
						<span class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {releaseColor(rel.order).badge}">
							{rel.version}
						</span>
						<span class="flex items-center gap-1.5 text-[10px] text-ink-500">
							{#if lifecycle === 'in-progress'}
								<span class="rounded-pill bg-warning-50 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-warning-600">
									In progress
								</span>
							{/if}
							W{rel.weekStart}-W{rel.weekEnd}
						</span>
					</div>
					<p class="mt-2 text-sm font-semibold text-ink-900">{rel.name || 'Untitled release'}</p>
					<div class="mt-3">
						<div class="flex items-center justify-between text-[10px] text-ink-500">
							<span>{count} features</span>
							<span class="flex items-center gap-1.5">
								{#if cov}
									<span
										class="font-mono text-ink-400"
										title="Share of these features' spec located in code by the last adoption sync"
										>&lt;/&gt; {cov.percent}%</span
									>
								{/if}
								<span class="font-semibold text-success-600">{pct}%</span>
							</span>
						</div>
						<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/60">
							<div class="h-full rounded-full {releaseColor(rel.order).bar}" style="width: {pct}%"></div>
						</div>
					</div>
				</button>
			{/each}

			<button
				type="button"
				onclick={() => (selectedReleaseId = store.addRelease({ name: 'New release' }))}
				class="flex flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line p-6 text-ink-400 hover:border-brand-300 hover:bg-brand-50/20 hover:text-brand-500"
			>
				<Icon name="plus" size={18} />
				<span class="text-xs font-medium">Add release</span>
			</button>
		</div>

		<!-- Selected release detail (merged into the release-strip card) -->
	{#if selectedRelease}
		{@const pct = progressOf(selectedRelease.id)}
		<div class="mt-5 border-t border-line pt-5">
			<div class="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
				<div class="shrink-0">
					<label for="rel-version-{selectedRelease.id}" class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Release number</label>
					<input
						id="rel-version-{selectedRelease.id}"
						type="text"
						value={selectedRelease.version}
						oninput={(e) => store.updateRelease(selectedRelease!.id, 'version', e.currentTarget.value)}
						placeholder="v?"
						class="w-24 text-center text-xs font-semibold h-9 rounded-field border border-line bg-surface px-2.5 text-ink-900 outline-none focus:border-brand-300"
					/>
				</div>
				<div class="min-w-[10rem] flex-1">
					<label for="rel-name-{selectedRelease.id}" class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Release name</label>
					<input
						id="rel-name-{selectedRelease.id}"
						type="text"
						value={selectedRelease.name}
						oninput={(e) => store.updateRelease(selectedRelease!.id, 'name', e.currentTarget.value)}
						placeholder="Release name"
						class="block w-full text-sm font-semibold placeholder:text-ink-300 h-9 rounded-field border border-line bg-surface px-2.5 text-ink-900 outline-none focus:border-brand-300"
					/>
				</div>
				<div class="shrink-0">
					<span
						id="rel-weeks-{selectedRelease.id}"
						class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400"
						>Week range</span
					>
					<!-- Captions the start/end pair, not one control — each input carries its own aria-label. -->
					<div
						role="group"
						aria-labelledby="rel-weeks-{selectedRelease.id}"
						class="flex items-center gap-1.5"
					>
						<input
							type="number"
							min="1"
							value={selectedRelease.weekStart}
							oninput={(e) => store.updateRelease(selectedRelease!.id, 'weekStart', Number(e.currentTarget.value))}
							aria-label="Week start"
							class="w-14 text-center text-xs h-9 rounded-field border border-line bg-surface px-2.5 text-ink-900 outline-none focus:border-brand-300"
						/>
						<span class="text-ink-400">-</span>
						<input
							type="number"
							min="1"
							value={selectedRelease.weekEnd}
							oninput={(e) => store.updateRelease(selectedRelease!.id, 'weekEnd', Number(e.currentTarget.value))}
							aria-label="Week end"
							class="w-14 text-center text-xs h-9 rounded-field border border-line bg-surface px-2.5 text-ink-900 outline-none focus:border-brand-300"
						/>
					</div>
				</div>
				<span class="flex h-9 items-center self-end text-[11px] text-ink-400">{featuresInSelected.length} features</span>
				<div class="ml-auto flex h-9 items-center gap-2 self-end">
					<div class="h-2 w-28 overflow-hidden rounded-full bg-surface-sunken" title="Done leaves / total leaves">
						<div class="h-full rounded-full bg-success-500 transition-all" style="width: {pct}%"></div>
					</div>
					<span class="w-9 text-right text-sm font-semibold text-success-600">{pct}%</span>
					<button
						type="button"
						onclick={removeSelectedRelease}
						title="Remove this release (its features go back to the backlog)"
						class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
						aria-label="Remove release"
					>
						<Icon name="x" size={13} />
					</button>
				</div>
			</div>

			<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
				<p class="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
					Features in this release
				</p>
				<div class="flex items-center gap-3">
					<span class="text-[10px] text-ink-400">Give each feature an owner and a sprint to distribute the work</span>
					<SearchPicker
						options={addFeatureOptions}
						onPick={addFeatureToSelected}
						triggerLabel="Add feature"
						triggerTitle="Schedule a feature in this release (from the backlog or another release)"
						placeholder="Search features…"
						emptyText="Every feature is already in this release."
						align="right"
					/>
				</div>
			</div>
			{#if visibleInSelected.length > 0}
				<!-- Scannable table: one row per feature, aligned columns. Replaces the
				     cramped multi-segment chips — this is the "easier to read" layout. -->
				<div class="rounded-field border border-line">
					<div class="hidden grid-cols-[1fr_auto_auto_auto_auto] rounded-t-field gap-3 border-b border-line bg-surface-sunken/50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-ink-400 @lg:grid">
						<span>Feature</span>
						<span>Status</span>
						<span>Owner</span>
						<span>Sprint</span>
						<span></span>
					</div>
					{#each visibleInSelected as feat (feat.id)}
						{@const core = coreOf(feat.id)}
						{@const tone = core?.tone ?? 'custom'}
						{@const st = statusOf(feat.id)}
						{@const target = { kind: 'feature' as const, featureId: feat.id }}
						{@const assignment = store.getAssignment(target)}
						<div
							class="grid grid-cols-2 items-center gap-2 border-b border-line px-3 py-2 last:border-0 hover:bg-surface-sunken/30 @lg:grid-cols-[1fr_auto_auto_auto_auto] @lg:gap-3"
						>
							<!-- Feature name + core dot + code-coverage chip -->
							<div class="col-span-2 flex min-w-0 items-center gap-2 @lg:col-span-1">
								<span
									class="size-2.5 shrink-0 rounded-full border border-line {CORE_PILL[tone].bg}"
									title={core?.name || 'Core'}
								></span>
								<span class="truncate text-sm text-ink-900">{feat.name || '<unnamed>'}</span>
								<span class="hidden shrink-0 text-[9px] font-semibold uppercase tracking-wide text-ink-400 @sm:inline">
									{(core?.name || 'CORE').slice(0, 14)}
								</span>
								<ImplementationBadge coverage={implementation.get(feat.id)} />
								{#if hasDrift(feat.id)}
									<span
										class="shrink-0 cursor-help text-warning-600"
										title="Marked done, but the last code-adoption sync did not locate its whole spec in the code. Re-sync, or reopen the feature."
									>
										<Icon name="info" size={12} />
									</span>
								{/if}
							</div>
							<!-- Status -->
							<label class="justify-self-start rounded-pill {STATUS_META[st].bg} px-1.5">
								<select
									value={st}
									onchange={(e) =>
										store.updateLeafMeta(feat.id, { status: e.currentTarget.value as LeafStatus })}
									aria-label="Feature status"
									class="cursor-pointer bg-transparent py-1 text-[10px] font-semibold uppercase tracking-wide outline-none {STATUS_META[st].text}"
								>
									{#each STATUS_ORDER as s (s)}
										<option value={s}>{STATUS_META[s].label}</option>
									{/each}
								</select>
							</label>
							<!-- Owner -->
							<div class="justify-self-start">
								<AssigneeChip
									assigneeId={assignment?.assigneeId ?? null}
									{collaborators}
									onPick={(id) => store.assignWorkItem(target, id)}
								/>
							</div>
							<!-- Sprint -->
							<div class="justify-self-start">
								<SprintChip
									sprintId={assignment?.sprintId ?? null}
									{sprints}
									onPick={(sid) => store.setWorkItemSprint(target, sid)}
								/>
							</div>
							<!-- Remove from release -->
							<button
								type="button"
								onclick={() => store.unassignFeatureFromRelease(feat.id)}
								aria-label="Remove feature from release"
								title="Remove from this release"
								class="grid size-6 place-items-center justify-self-end rounded text-ink-400 hover:bg-danger-50 hover:text-danger-500"
							>
								<Icon name="x" size={12} />
							</button>
						</div>
					{/each}
				</div>

				<!-- Per-status count summary -->
				<div class="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
					{#each STATUS_ORDER as s (s)}
						{@const n = visibleInSelected.filter((f) => statusOf(f.id) === s).length}
						<span class="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 {STATUS_META[s].bg} {STATUS_META[s].text}">
							<span class="font-semibold">{n}</span>
							<span class="uppercase tracking-wide">{STATUS_META[s].label}</span>
						</span>
					{/each}
				</div>
			{:else if searching && featuresInSelected.length > 0}
				<p class="rounded-field border border-dashed border-line py-4 text-center text-xs text-ink-400">
					No feature of this release matches the search.
				</p>
			{:else}
				<p class="rounded-field border border-dashed border-line py-4 text-center text-xs text-ink-400">
					No features in this release yet. Use "Add feature" above, or pick it from the backlog below.
				</p>
			{/if}
		</div>
	{/if}
	</div>

	<!-- Sprints — managed delivery buckets for the queue -->
	<SprintsPanel {store} {featureActions} />

	<!-- Work queue — next task by member, organized by sprint -->
	<WorkQueueBoard {store} {collaborators} {featureActions} />

	<!-- Shipped timeline: archived releases (stable) + done-but-unpinned ones -->
	{#if visibleShipped.length > 0}
		<div class="rounded-card border border-line bg-surface p-5 opacity-70 transition hover:opacity-100">
			<div class="mb-3 flex items-center gap-2">
				<Icon name="check" size={13} class="text-ink-400" />
				<p class="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
					Shipped · {visibleShipped.length} release{visibleShipped.length > 1 ? 's' : ''}
				</p>
				<span class="text-[11px] text-ink-400">
					Mark a finished release as shipped to pin it here for good
				</span>
			</div>
			<div class="relative pl-6">
				<div class="absolute bottom-2 left-2 top-2 w-px bg-line"></div>
				<div class="space-y-3">
					{#each visibleShipped as rel, seq (rel.id)}
						<div class="relative rounded-card border border-line bg-surface-sunken p-3">
							<div class="absolute -left-4.5 top-3 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[9px] font-semibold text-ink-500">
								{seq + 1}
							</div>
							<div class="mb-2 flex items-center gap-2">
								<span class="rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-500">
									{rel.version}
								</span>
								<span class="truncate text-xs font-medium text-ink-600">{rel.name || 'Untitled release'}</span>
								<span class="text-[10px] text-ink-400">· W{rel.weekStart}-W{rel.weekEnd}</span>
								<span class="ml-auto flex items-center gap-2">
									{#if rel.archivedAt}
										<span class="flex items-center gap-1 text-[10px] text-ink-400" title="Pinned in history; reopening a feature no longer moves it back">
											<Icon name="check" size={11} /> Shipped {rel.archivedAt.slice(0, 10)}
										</span>
										<button
											type="button"
											onclick={() => store.unarchiveRelease(rel.id)}
											title="Put this release back on the board"
											class="rounded-field border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-500 hover:border-brand-300 hover:text-brand-500"
										>
											Reopen
										</button>
									{:else}
										<span class="text-[10px] text-ink-400" title="Derived from feature statuses; it returns to the board if a feature reopens">
											All features done
										</span>
										<button
											type="button"
											onclick={() => store.archiveRelease(rel.id)}
											title="Pin this release as shipped: it stays here even if a feature is reopened later"
											class="rounded-field bg-brand-gradient px-2.5 py-1 text-[10px] font-semibold text-white hover:shadow-card"
										>
											Mark shipped
										</button>
									{/if}
								</span>
							</div>
							{#if featuresOfRelease(rel.id).length === 0}
								<p class="text-[11px] italic text-ink-400">No feature recorded in this release.</p>
							{:else}
								<div class="flex flex-wrap gap-1.5">
									{#each featuresOfRelease(rel.id) as feat (feat.id)}
										{@const core = coreOf(feat.id)}
										<div class="inline-flex items-center gap-1.5 rounded-field border border-line bg-surface px-2 py-1">
											<Icon name="check" size={10} class="text-ink-400" />
											<span class="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
												{(core?.name || 'CORE').slice(0, 12).toUpperCase()}
											</span>
											<span class="text-[11px] text-ink-500">{feat.name || '<unnamed>'}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Backlog -->
	{#if visibleBacklog.length > 0}
		{@const targetRelease = selectedRelease}
		<div class="rounded-card border border-warning-200 bg-warning-50/30 p-5">
			<div class="mb-3 flex items-center justify-between gap-3">
				<p class="text-xs">
					<Icon name="info" size={12} class="inline" />
					<span class="font-semibold text-warning-600">
						Backlog · {searching ? `${visibleBacklog.length} of ${backlog.length}` : backlog.length}
					</span>
					<span class="text-ink-500">
						{#if upcomingReleases.length > 0}
							Features not scheduled in any release yet
						{:else}
							Features not scheduled in any release yet. Add a release above to plan them.
						{/if}
					</span>
				</p>
				{#if targetRelease}
					<button
						type="button"
						onclick={() => store.addBacklogToRelease(targetRelease.id)}
						title="Schedule every backlog feature in the release open above"
						class="rounded-field bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white hover:shadow-card"
					>
						Add all to {targetRelease.version}
					</button>
				{/if}
			</div>

			<!-- Same grid + card shape as the release strip, so the backlog reads as
			     "unscheduled releases-to-be" rather than a loose tag cloud. -->
			<div class="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
				{#each visibleBacklog as feat (feat.id)}
					{@const core = coreOf(feat.id)}
					{@const tone = core?.tone ?? 'custom'}
					<div class="rounded-card border border-line bg-surface p-3">
						<div class="flex items-center justify-between gap-2">
							<span class="rounded-pill {CORE_PILL[tone].bg} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {CORE_PILL[tone].eyebrow}">
								{(core?.name || 'CORE').slice(0, 12).toUpperCase()}
							</span>
						</div>
						<p class="mt-2 text-sm font-semibold text-ink-900">{feat.name || '<unnamed>'}</p>
						{#if upcomingReleases.length > 0}
							<div class="mt-3 flex flex-wrap items-center gap-1">
								{#each upcomingReleases as rel (rel.id)}
									<button
										type="button"
										onclick={() => store.assignFeatureToRelease(feat.id, rel.id)}
										title="Move to {rel.version}"
										class="rounded-field border border-line px-1.5 py-0.5 text-[9px] font-semibold text-ink-500 hover:border-brand-300 hover:bg-white hover:text-brand-500"
									>
										→ {rel.version}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
