<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { FeaturesStore } from '$ui/features/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import { anchorKeyFromUrl, focusField } from '$ui/shell/focus-field';
	import TabBar from '$ui/features/TabBar.svelte';
	import FeatureTreeView from '$ui/features/sections/FeatureTreeView.svelte';
	import FeatureSuggestionsCard from '$ui/features/sections/FeatureSuggestionsCard.svelte';
	import LeafDetailPanel from '$ui/features/sections/LeafDetailPanel.svelte';
	import RoadmapDashboard from '$ui/features/sections/RoadmapDashboard.svelte';
	import BehaviorPanel from '$ui/features/sections/BehaviorPanel.svelte';
	import AssignmentsDashboard from '$ui/features/sections/AssignmentsDashboard.svelte';
	import DeliveryDashboard from '$ui/features/sections/DeliveryDashboard.svelte';
	import RulesPanel from '$ui/rules/RulesPanel.svelte';
	import { RulesStore } from '$ui/rules/draft-store.svelte';
	import { YjsFeatureSync } from '$ui/features/yjs-feature-sync.client';
	import { unspaDashboardBase } from '$ui/features/unspa-dashboard-url';
	import type { FeatureAdvice, FeatureImplementationCoverage } from '$application/use-cases';
	import { Icon } from '$ui/design-system';
	import { browser, dev } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const store = untrack(
		() => new FeaturesStore(data.draft, data.session, toastNotifier, data.revision)
	);
	// The leaf drawer selection is local UI state. Start closed; only an explicit
	// click opens it — EXCEPT a `?feature=<id>` deep-link (Control Center "Fix now" on a
	// behavior/unspa advisory), which opens that leaf's detail drawer directly.
	const deepLinkFeatureId = untrack(() => page.url.searchParams.get('feature'));
	const openDeepLinkFeature = untrack(
		() => !!deepLinkFeatureId && store.draft.features.some((f) => f.id === deepLinkFeatureId)
	);
	store.selectedFeatureId = openDeepLinkFeature ? deepLinkFeatureId : null;
	if (openDeepLinkFeature && store.activeTab !== 'tree') store.switchTab('tree');

	// Rules & edge cases folded in as a tab — its own editable store, mounted here.
	const rulesStore = untrack(
		() => new RulesStore(data.rulesDraft, data.session, toastNotifier, data.rulesRevision)
	);

	// Deep-link: /features?tab=behavior|rules (the folded Functional/Rules routes
	// redirect here). A ?feature= deep-link forces the tree tab and wins. 'mvp'
	// and 'reuse' are intentionally omitted — the MVP prioritization and Reuse
	// library tabs are hidden (their data is kept, just no longer surfaced).
	const FEATURE_TABS = ['tree', 'roadmap', 'behavior', 'rules', 'mywork', 'delivery'] as const;
	const urlTab = untrack(() => page.url.searchParams.get('tab'));
	if (
		!openDeepLinkFeature &&
		urlTab &&
		(FEATURE_TABS as readonly string[]).includes(urlTab) &&
		store.activeTab !== urlTab
	) {
		store.switchTab(urlTab as (typeof FEATURE_TABS)[number]);
	}

	// Deep-link: /features?new=1[&for=<roleName>] — the "New feature for this role"
	// next-best-action on the Users & Permissions coverage banner. Land in create
	// mode: ensure a core exists, add an empty feature and open its drawer on the
	// tree tab. No grant is authored here (that stays in the matrix); `for` only
	// personalises the toast. Browser-only + param-stripped so a refresh can't
	// spawn duplicate empty features.
	if (browser && !openDeepLinkFeature && page.url.searchParams.get('new') === '1') {
		const coreId = store.draft.cores[0]?.id ?? store.addCore();
		store.addFeatureToCore(coreId, '');
		if (store.activeTab !== 'tree') store.switchTab('tree');
		const forRole = page.url.searchParams.get('for');
		toastNotifier.notify(
			'info',
			forRole
				? `New feature created for "${forRole}". Name it, then grant it to the role in Users & Permissions.`
				: 'New feature created. Name it to get started.'
		);
		const cleaned = new URL(page.url);
		cleaned.searchParams.delete('new');
		cleaned.searchParams.delete('for');
		history.replaceState(history.state, '', cleaned);
	}

	// An "open in behavior editor" action from another tab (Rules & edge cases):
	// switch to the Behavior tab with its EMBEDDED editor open on this route
	// (null path = the project itself). Cleared on any manual tab switch so a
	// later visit to the Behavior tab opens on its overview as usual.
	//
	// Another PAGE reaches the same editor by URL (`?tab=behavior&editor=<route>`,
	// built by `behaviorTabHref`) since it cannot call into this page's state.
	const urlEditorPath = untrack(() => page.url.searchParams.get('editor'));
	let behaviorEditorRequest = $state<{ path: string | null } | null>(
		store.activeTab === 'behavior' && urlEditorPath ? { path: urlEditorPath } : null
	);
	const openBehaviorEditor = (path: string | null = null) => {
		behaviorEditorRequest = { path };
		store.switchTab('behavior');
	};

	// Rules sub-tab deep-link (?tab=rules&rtab=…) — a graph/search link to a
	// rule or edge case lands on the panel that actually shows it.
	const RULES_TABS = ['inventory', 'edge_cases'] as const;
	const urlRulesTab = untrack(() => page.url.searchParams.get('rtab'));
	if (
		urlRulesTab &&
		(RULES_TABS as readonly string[]).includes(urlRulesTab) &&
		rulesStore.activeTab !== urlRulesTab
	) {
		rulesStore.switchTab(urlRulesTab as (typeof RULES_TABS)[number]);
	}

	// Live-sync: re-hydrate both stores when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
		rulesStore.hydrate(data.rulesDraft, data.rulesRevision);
	});

	const projectName = $derived(data.productName);

	// Deep-link jump target ("Fix now" from Global Coherence): the `use:focusField`
	// below flashes the matching `data-anchor` field once the page has landed.
	const focusKey = $derived(anchorKeyFromUrl(page.url));

	// Behavior-editor base URL for the leaf drawer's "Open behavior editor" deep
	// link. Children turn it into a brand-tagged feature link via
	// `unspaFeatureHref` (see unspa-dashboard-url).
	const unspaBaseUrl = unspaDashboardBase();

	// Maturity advice + availability come from the cached advisor via `load`: the
	// first read is instant (snapshot), and the engine's background refresh pushes
	// a `features-advice` section change that re-runs this load (through the
	// project-wide sync key) so the badges fill in live — no blocking fetch.
	const advice = $derived<FeatureAdvice[]>(data.advice);
	const advisorAvailable = $derived(data.advisorAvailable);

	// In-process maturity per leaf, folded from the same kernel snapshots the
	// Behavior tab reads. The tree's TRL badge falls back to it while the cached
	// advisor is still refreshing (cold engine, fresh MCP-authored project), so
	// a scored feature never shows an empty TRL.
	const maturityByFeature = $derived<ReadonlyMap<string, number>>(
		new Map(data.overview.features.map((f) => [f.featureId, f.maturity]))
	);

	// Per-leaf code-implementation coverage from the adoption sidecar. Empty when
	// the engine is off or nothing was ever adopted; the chips then never render.
	const implementationByFeature = $derived<ReadonlyMap<string, FeatureImplementationCoverage>>(
		new Map(Object.entries(data.implementation))
	);

	// All browser collaboration passes through the application's session and
	// project authorization. Direct relay ports bypass that policy.
	const YJS_WS_URL = browser
		? (dev ? env.PUBLIC_YJS_WS_URL?.trim() ?? '' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/yjs`)
		: '';
	let yjsConnectedRooms = $state(0);
	let yjsSync: YjsFeatureSync | null = null;

	// No client score fetch: scoring is served from the cached advisor through
	// `load` (instant), and its background refresh — plus staling on any
	// features/rules edit — pushes a `features-advice` change that re-runs this
	// load. Live-sync carries fresh badges here with no blocking request.

	onMount(() => {
		// No relay configured/derivable (e.g. localhost dev) — skip Yjs entirely so
		// we don't open doomed WebSockets. Live name/description co-editing is off;
		// autosave + SSE live-sync are unaffected.
		if (!YJS_WS_URL) return;

		// Spin up Yjs binding for every current leaf, then keep the connection
		// list in sync as leaves are added / removed. The dashboard at
		// http://127.0.0.1:3001 acts as the relay.
		yjsSync = new YjsFeatureSync(YJS_WS_URL, store.draft.projectId, {
			onRemoteName: (id, name) => {
				const f = store.draft.features.find((f) => f.id === id);
				if (f && f.name !== name) store.updateFeature(id, 'name', name);
			},
			onRemoteDescription: (id, description) => {
				const f = store.draft.features.find((f) => f.id === id);
				if (f && f.description !== description)
					store.updateFeature(id, 'description', description);
			},
			onStatusChange: (n) => (yjsConnectedRooms = n)
		});

		// Track leaf ids on every change; open/close rooms accordingly.
		const tracked = new Set<string>();
		const stop = $effect.root(() => {
			$effect(() => {
				const ids = new Set(store.draft.features.map((f) => f.id));
				for (const id of ids) {
					if (!tracked.has(id)) {
						yjsSync!.connect(id);
						tracked.add(id);
					}
				}
				for (const id of [...tracked]) {
					if (!ids.has(id)) {
						yjsSync!.disconnect(id);
						tracked.delete(id);
					}
				}
			});

			// Outbound: when a leaf's name/description changes locally, push to Yjs.
			$effect(() => {
				if (!yjsSync) return;
				for (const f of store.draft.features) {
					yjsSync.pushLocalName(f.id, f.name);
					yjsSync.pushLocalDescription(f.id, f.description);
				}
			});
		});

		return () => {
			stop();
			yjsSync?.dispose();
		};
	});
</script>

<svelte:head>
	<title>{projectName} · Features & Prioritization · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5" use:focusField={focusKey}>
		<PageHeading
			eyebrow="Features & Prioritization"
			title="Features, prioritization, roadmap."
			description="Organize the product as a tree: Core → Family → Feature. Families nest as deep as you want, like Russian dolls. Only the deepest leaf (Feature) can be detailed."
			help={CAPABILITY_HELP.features}
			class="mb-7"
		/>

				<div class="mb-6">
					<TabBar
						active={store.activeTab}
						{store}
						onSwitch={(tab) => {
							behaviorEditorRequest = null;
							store.switchTab(tab);
						}}
						behaviorCount={data.overview.features.length}
						rulesCount={rulesStore.draft.inventory.length + rulesStore.draft.scenarios.length}
					/>
				</div>

				<!-- Behavior scoring status. Only shown to explain WHY scoring/gap
				     analysis is absent — no engine names or connection details. -->
				{#if !advisorAvailable}
					<div class="mb-4 flex items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken px-4 py-2 text-xs text-ink-400">
						<span class="flex items-center gap-2">
							<Icon name="cpu" size={13} />
							<span>Behavior scoring and gap analysis are unavailable right now.</span>
						</span>
						<button
							type="button"
							onclick={() => void invalidateAll()}
							class="rounded-field border border-line bg-surface px-2 py-1 font-medium hover:bg-surface-sunken"
						>
							Retry
						</button>
					</div>
				{/if}

				<!-- Live-sync reassurance chip — shown only while connected. No WebSocket
				     address or dev-env copy on ordinary authoring screens. -->
				{#if yjsConnectedRooms > 0}
					<div class="mb-6 flex items-center gap-2 rounded-card border border-line bg-info-50/40 px-4 py-2 text-xs text-info-600">
						<Icon name="info" size={13} />
						<strong class="font-semibold">Live sync on.</strong>
						<span>Edits propagate across tabs and the behavior editor in real time.</span>
					</div>
				{/if}

				<div class="@container space-y-6 pb-4">
					{#if store.activeTab === 'tree'}
						<!-- The mockup's Step4 layout: MCP-sourced suggestions on top, then the
						     full-width feature tree. The selected leaf opens in a right
						     sliding drawer (rendered below), matching the mockup's overlay. -->
						<FeatureSuggestionsCard {store} />
						<FeatureTreeView
							{store}
							{advice}
							featureActions={data.featureActions}
							maturity={maturityByFeature}
							implementation={implementationByFeature}
							collaborators={data.team.collaborators}
							{unspaBaseUrl}
							onOpenEditor={openBehaviorEditor}
						/>
					{:else if store.activeTab === 'roadmap'}
						<RoadmapDashboard
							{store}
							collaborators={data.team.collaborators}
							featureActions={data.featureActions}
							implementation={implementationByFeature}
						/>
					{:else if store.activeTab === 'behavior'}
						<BehaviorPanel
							overview={data.overview}
							dashboardProjectId={data.dashboardProjectId}
							canEdit={data.canUseSharedEditor}
							implementation={implementationByFeature}
							{advice}
							releases={store.draft.releases}
							assignments={store.draft.roadmapAssignments}
							manualTrl={new Map(
								store.draft.features.flatMap((f) => {
									const t = store.getLeafMeta(f.id).trl;
									return t != null ? [[f.id, t] as [string, number]] : [];
								})
							)}
							editorRequest={behaviorEditorRequest}
						/>
					{:else if store.activeTab === 'mywork'}
						<AssignmentsDashboard
							{store}
							collaborators={data.team.collaborators}
							featureActions={data.featureActions}
							currentEmail={data.session?.email ?? null}
						/>
					{:else if store.activeTab === 'delivery'}
						<DeliveryDashboard
							{store}
							collaborators={data.team.collaborators}
							featureActions={data.featureActions}
						/>
					{:else}
						<RulesPanel
							store={rulesStore}
							kernelRules={data.kernelRules}
							dashboardProjectId={data.dashboardProjectId}
							onOpenEditor={openBehaviorEditor}
						/>
					{/if}
			</div>
		</div>
	</div>

{#if store.activeTab === 'tree' && store.selectedFeatureId}
	<!-- Right sliding leaf-detail drawer (the mockup's overlay). The full-screen
	     button is the dimmed backdrop; clicking it closes the drawer. -->
	<button
		type="button"
		class="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
		aria-label="Close feature details"
		onclick={() => store.selectFeature(null)}
		transition:fade={{ duration: 200 }}
	></button>
	<aside
		class="fixed bottom-0 right-0 top-0 z-50 w-136 max-w-[92vw] overflow-y-auto border-l border-line bg-surface shadow-2xl"
		transition:fly={{ x: 560, duration: 280, easing: cubicOut }}
	>
		<div class="p-5">
			<LeafDetailPanel
				{store}
				{advice}
				localSummaries={data.overview.features}
				collaborators={data.team.collaborators}
				{unspaBaseUrl}
				onOpenEditor={openBehaviorEditor}
			/>
		</div>
	</aside>
{/if}

<SaveBar
	saveStatus={store.activeTab === 'rules' ? rulesStore.saveStatus : store.saveStatus}
	coherence={store.activeTab === 'rules' ? rulesStore.coherence : store.coherence}
/>
