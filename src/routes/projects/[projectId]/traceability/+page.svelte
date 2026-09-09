<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import { BaselinesStore } from '$ui/baselines/draft-store.svelte';
	import { ApprovalsStore } from '$ui/approvals/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import BaselinesBoard from '$ui/baselines/BaselinesBoard.svelte';
	import ApprovalsBoard from '$ui/approvals/ApprovalsBoard.svelte';
	import TabBar, { type TraceabilityTab } from '$ui/traceability/TabBar.svelte';
	import type { TraceabilityRow } from '$application/build-traceability';
	import type { SaveStatus } from '$ui/baselines/draft-store.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const projectName = $derived(data.productName);
	const rows = $derived(data.traceability.rows);
	const summary = $derived(data.traceability.summary);
	const projectId = $derived(page.params.projectId);

	// Baselines & Approvals fold in as tabs; each keeps its own editable draft +
	// autosave, exactly as its retired standalone page did.
	const notifier = toastNotifier;
	const baselines = untrack(
		() =>
			new BaselinesStore(data.baselines.draft, data.session, notifier, data.baselines.revision)
	);
	const approvals = untrack(
		() =>
			new ApprovalsStore(data.approvals.draft, data.session, notifier, data.approvals.revision)
	);

	// Deep-link a tab via ?tab=… (Control Center "Fix now" + the /baselines,
	// /approvals redirects land here). Applied once on mount so it doesn't fight
	// user clicks.
	let activeTab = $state<TraceabilityTab>('overview');
	untrack(() => {
		const q = page.url.searchParams.get('tab');
		if (q === 'baselines' || q === 'approvals') activeTab = q;
	});

	// Live-sync: re-hydrate both folded stores when a fresh server `load` lands.
	$effect(() => {
		baselines.hydrate(data.baselines.draft, data.baselines.revision);
	});
	$effect(() => {
		approvals.hydrate(data.approvals.draft, data.approvals.revision);
	});
	const counts = $derived<Record<TraceabilityTab, string>>({
		overview: String(summary.featureCount),
		baselines: String(baselines.draft.baselines.length),
		approvals: String(approvals.draft.items.length)
	});

	// One save indicator for the whole section — reflects whichever store is busy.
	const saveStatus = $derived<SaveStatus>(
		baselines.saveStatus === 'error' || approvals.saveStatus === 'error'
			? 'error'
			: baselines.saveStatus === 'saving' || approvals.saveStatus === 'saving'
				? 'saving'
				: 'saved'
	);

	const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
	const featureHref = (r: TraceabilityRow) =>
		`/projects/${projectId}/features?feature=${encodeURIComponent(r.featureId)}`;

	/* The coverage matrix is one row per requirement and grows with the project,
	   so it filters live on the two columns a reader can actually name: the
	   requirement and its core, plus the release, which is how people ask ("what
	   is still missing in V1?"). The summary tiles above stay whole-project on
	   purpose: they are the coverage figures, not a view of the filter. */
	let search = $state('');
	const visibleRows = $derived(
		rows.filter((r) => matchesQuery(search, r.name, r.coreName, r.releaseName))
	);

	const HEADINGS: Record<TraceabilityTab, { eyebrow: string; title: string; lede: string }> = {
		overview: {
			eyebrow: 'Coverage',
			title: "Every requirement, and what it's missing.",
			lede: 'Each feature as a requirement, traced to its acceptance criteria, behavior, source and release. Red cells are the coverage gaps to close.'
		},
		baselines: {
			eyebrow: 'Baselines',
			title: 'Named versions of the spec.',
			lede: 'Freeze the specification at discovery, design, or launch. Each baseline records the scores, the feature count, and a full requirements-document snapshot you can compare against today and export.'
		},
		approvals: {
			eyebrow: 'Approvals',
			title: 'Sign-off, reviews & accepted risks.',
			lede: 'Track who reviews what, where each part of the spec stands, and record the rationale behind every approval or accepted risk - a lightweight worklist, not a workflow engine.'
		}
	};
	const heading = $derived(HEADINGS[activeTab]);
</script>

<svelte:head>
	<title>{projectName} · Traceability · Lyriks</title>
</svelte:head>

{#snippet cell(ok: boolean, label: string)}
	<td class="px-3 py-2 text-center">
		{#if ok}
			<span class="inline-flex items-center gap-1 text-success-600" title={label}>
				<Icon name="check" size={14} />
			</span>
		{:else}
			<span class="inline-flex items-center gap-1 text-danger-500" title="Missing: {label}">
				<Icon name="x" size={14} />
			</span>
		{/if}
	</td>
{/snippet}

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<header class="mb-7">
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">{heading.eyebrow}</p>
			<h1 class="mt-1 text-3xl font-bold tracking-tight text-ink-900">{heading.title}</h1>
			<p class="mt-2 max-w-2xl text-sm text-ink-500">{heading.lede}</p>
		</header>

		<div class="mb-6">
			<TabBar active={activeTab} {counts} onSwitch={(t) => (activeTab = t)} />
		</div>

		{#if activeTab === 'overview'}
			{#if rows.length === 0}
				<div class="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
					<p class="text-sm font-semibold text-ink-700">No features to trace yet.</p>
					<p class="mt-1 text-xs text-ink-500">Author features first - they are the requirement backbone.</p>
				</div>
			{:else}
				<!-- Coverage summary -->
				<div class="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
					{#each [{ label: 'Features', v: summary.featureCount, d: summary.featureCount }, { label: 'With acceptance', v: summary.withAcceptance, d: summary.featureCount }, { label: 'With behavior', v: summary.withBehavior, d: summary.featureCount }, { label: 'With source', v: summary.withSource, d: summary.featureCount }, { label: 'Orphans', v: summary.orphanCount, d: summary.featureCount }] as s (s.label)}
						<div class="rounded-card border border-line bg-surface px-3 py-2.5">
							<p class="text-2xl font-bold tabular-nums text-ink-900">{s.v}</p>
							<p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">{s.label}</p>
							{#if s.label !== 'Features' && s.label !== 'Orphans'}
								<p class="text-[10px] text-ink-400">{pct(s.v, s.d)}% coverage</p>
							{/if}
						</div>
					{/each}
				</div>

				<div class="mb-3">
					<SearchInput
						bind:value={search}
						placeholder="Search a requirement, core or release…"
						size="md"
						class="max-w-sm"
						resultLabel="{visibleRows.length} of {rows.length} requirements"
					/>
				</div>

				{#if visibleRows.length === 0}
					<p class="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-500">
						No requirement matches the search.
					</p>
				{:else}
				<div class="overflow-x-auto rounded-card border border-line bg-surface">
					<table class="w-full min-w-[720px] text-sm">
						<thead>
							<tr class="border-b border-line text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
								<th class="px-3 py-2 text-left">Requirement</th>
								<th class="px-3 py-2 text-center">Problem</th>
								<th class="px-3 py-2 text-center">Acceptance</th>
								<th class="px-3 py-2 text-center">Behavior</th>
								<th class="px-3 py-2 text-center">Source</th>
								<th class="px-3 py-2 text-center">Deps</th>
								<th class="px-3 py-2 text-left">Release</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line">
							{#each visibleRows as r (r.featureId)}
								<tr class="hover:bg-surface-sunken/40">
									<td class="px-3 py-2">
										<a href={featureHref(r)} class="font-medium text-ink-800 hover:text-brand-600 hover:underline">
											{r.name || 'Untitled feature'}
										</a>
										{#if r.coreName}<span class="block text-[10px] text-ink-400">{r.coreName}</span>{/if}
									</td>
									{@render cell(r.hasProblem, 'problem statement')}
									<td class="px-3 py-2 text-center {r.acceptanceCount === 0 ? 'text-danger-500' : 'text-ink-700'}">
										{r.acceptanceCount || '-'}
									</td>
									<td class="px-3 py-2 text-center {r.surfaceCount === 0 && r.actionCount === 0 ? 'text-danger-500' : 'text-ink-700'}">
										{r.surfaceCount + r.actionCount === 0 ? '-' : `${r.surfaceCount}s · ${r.actionCount}a`}
									</td>
									<td class="px-3 py-2 text-center">
										{#if r.missingSourceCount > 0}
											<span class="inline-flex items-center gap-1 text-warning-600" title="{r.missingSourceCount} broken source reference(s)">
												<Icon name="circle-alert" size={14} /> {r.sourceCount || '-'}
											</span>
										{:else if r.hasSource}
											<span class="inline-flex items-center gap-1 text-success-600" title="{r.sourceCount} source(s)">
												<Icon name="check" size={14} /> {r.sourceCount}
											</span>
										{:else}
											<span class="inline-flex items-center text-danger-500" title="Missing: source">
												<Icon name="x" size={14} />
											</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-center text-ink-700">{r.dependencyCount || '-'}</td>
									<td class="px-3 py-2 text-[12px] {r.releaseName ? 'text-ink-700' : 'text-danger-500'}">
										{r.releaseName ?? 'unassigned'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{/if}
			{/if}
		{:else if activeTab === 'baselines'}
			<BaselinesBoard store={baselines} current={data.baselines.current} />
		{:else}
			<ApprovalsBoard store={approvals} />
		{/if}
	</div>
</div>

<SaveBar {saveStatus} />
