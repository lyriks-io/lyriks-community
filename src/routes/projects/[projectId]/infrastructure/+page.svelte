<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { focusField } from '$ui/shell/focus-field';
	import { DataStore } from '$ui/data/draft-store.svelte';
	import { ArchitectureStore } from '$ui/architecture/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from '$ui/shell/SaveBar.svelte';
	import DataArchitectureBoard from '$ui/data/board/DataArchitectureBoard.svelte';
	import { isBoardView, resolveDeepLink, type BoardView } from '$ui/data/board/deep-link';
	import GraphExplorer from '$ui/graph/GraphExplorer.svelte';
	import KernelResources from '$ui/architecture/sections/KernelResources.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const notifier = toastNotifier;
	const store = untrack(() => new DataStore(data.draft, data.session, notifier, data.revision));
	// Architecture folds into this single "Data & Architecture" surface. It keeps
	// its own store + /api/draft/architecture endpoint — only the screen is merged.
	const arch = untrack(
		() => new ArchitectureStore(data.archDraft, data.session, notifier, data.archRevision)
	);

	// Live-sync: re-hydrate both stores when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
		arch.hydrate(data.archDraft, data.archRevision);
	});

	const projectName = $derived(data.productName);
	const projectId = $derived(page.params.projectId);

	// Deep-link from the graph explorer / search (`?node=<draftId>`): the board
	// resolves it to the view + inspector that edits that object.
	const deepLinkNodeId = untrack(() => page.url.searchParams.get('node'));
	const deepLinkView = untrack(() => resolveDeepLink(data.draft, data.archDraft, deepLinkNodeId).view);

	// The active tab lives in the URL (`?tab=`) rather than in component state,
	// because the Knowledge graph tab is loaded server-side: switching to it has
	// to re-run `load`. Everything else on the page survives the navigation
	// (same pathname → the layout does not remount, the stores keep their state).
	const view = $derived<BoardView>(
		isBoardView(page.url.searchParams.get('tab')) ? (page.url.searchParams.get('tab') as BoardView) : deepLinkView
	);
	function selectView(next: BoardView) {
		const url = new URL(page.url);
		url.searchParams.set('tab', next);
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}
	const documentsHref = $derived(`/projects/${projectId}/documents`);

	// The infra map is the one tab laid out as an app shell rather than a document:
	// it claims exactly the height between the top bar and the save bar, and the
	// canvas scrolls inside it. That is what lets the inspector pin its top AND its
	// bottom — a page that scrolls can only ever pin one of the two.
	const fillsViewport = $derived(view === 'map');

	/** The graph's Combined/Local/Engine switch, staying on this tab. */
	const graphSourceHref = (source: 'local' | 'engine' | 'merged') =>
		`/projects/${projectId}/infrastructure?tab=graph${source === 'merged' ? '' : `&source=${source}`}`;

	// One save indicator for the whole page — whichever store is busy/errored wins.
	const saveStatus = $derived(
		store.saveStatus === 'error' || arch.saveStatus === 'error'
			? 'error'
			: store.saveStatus === 'saving' || arch.saveStatus === 'saving'
				? 'saving'
				: 'saved'
	);
</script>

<svelte:head>
	<title>{projectName} · Data & Architecture · Lyriks</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto" use:focusField={deepLinkNodeId}>
	<!-- `shrink-0` keeps every other tab a plain scrolling document; on the map tab
	     `lg:flex-1` hands this block the exact scroll-port height instead. -->
	<div class="flex w-full shrink-0 flex-col px-6 py-5 {fillsViewport ? 'lg:min-h-0 lg:flex-1' : ''}">
		<PageHeading
			eyebrow="Data & Architecture"
			title="One map: where the product lives, how the bricks talk, what runs it."
			description="Hosts, databases, tables and their relations on a single canvas - click any brick to edit it, move a table by changing its database, and wire interfaces between real endpoints. The stack, its constraints and the whole-project knowledge graph fold in below."
			help={CAPABILITY_HELP.infrastructure}
			class="mb-6 shrink-0"
		/>

		<DataArchitectureBoard
			{store}
			{arch}
			{view}
			onView={selectView}
			deepLink={deepLinkNodeId}
			derivedVisibility={data.derivedVisibility}
		>
			{#snippet graphTab()}
				<!--
					`data.graph` is streamed (see +page.server.ts): the tab commits instantly
					and shows a skeleton until the merged graph resolves, instead of blocking
					the whole page on a build that reads every context.
				-->
				<!-- Sized to the space left by the top bar, this page's header + tab bar and
				     the save bar, so the canvas never slides under any of them. -->
				<div
					class="h-[calc(100vh-23rem)] min-h-120 overflow-hidden rounded-card border border-line"
				>
					{#await data.graph}
						<div class="grid h-full place-items-center bg-canvas text-ink-400">
							<div class="flex flex-col items-center gap-3">
								<span class="spinner" aria-hidden="true"></span>
								<p class="text-sm font-medium" role="status">Building the knowledge graph…</p>
							</div>
						</div>
					{:then graph}
						{#if graph}
							{#key graph.projectId + data.graphSource}
								<GraphExplorer
									{graph}
									productName={projectName}
									source={data.graphSource}
									formalDpoEnabled={data.formalDpoEnabled}
									sourceHref={graphSourceHref}
								/>
							{/key}
						{/if}
					{/await}
				</div>
			{/snippet}

			{#snippet resourcesPanel()}
				<!-- Streamed like the graph (see +page.server.ts): the fold reads every
				     feature snapshot, so the tab commits first and the panel fills in. -->
				{#await data.kernelResources}
					<div class="rounded-card border border-line bg-surface px-4 py-6 text-center text-sm text-ink-400">
						<span role="status">Checking the behavior model…</span>
					</div>
				{:then resources}
					{#if resources}
						<KernelResources model={resources} {projectId} />
					{/if}
				{/await}
			{/snippet}
		</DataArchitectureBoard>
	</div>
</div>

<SaveBar {saveStatus} coherence={store.coherence} />

<style>
	.spinner {
		width: 26px;
		height: 26px;
		border-radius: 999px;
		border: 2.5px solid color-mix(in oklab, var(--color-brand-500) 22%, transparent);
		border-top-color: var(--color-brand-500);
		animation: spinner-rotate 0.8s linear infinite;
	}
	@keyframes spinner-rotate {
		to {
			transform: rotate(360deg);
		}
	}
</style>
