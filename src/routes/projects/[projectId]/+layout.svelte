<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import TopBar from '$ui/shell/TopBar.svelte';
	import Sidebar from '$ui/shell/Sidebar.svelte';
	import NavProgress from '$ui/shell/NavProgress.svelte';
	import ControlCenter from '$ui/shell/ControlCenter.svelte';
	import LockedCapability from '$ui/shell/LockedCapability.svelte';
	import { capabilityById } from '$ui/shell/capabilities';
	import { tierAllows } from '$domain/tier/tier';
	import { startLiveSync } from '$ui/shell/live-sync.client';
	import { setGlossaryTerms } from '$ui/glossary/glossary-context';
	import { DocumentRegistry, setDocumentRegistry } from '$ui/documents/registry.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Provide the governed vocabulary to every capability page. The accessor reads
	// `data` live, so terms added on the Glossary page propagate via live-sync.
	setGlossaryTerms(() => data.glossaryTerms);

	// The evidence register, provided once for the whole project: every citation
	// control reads these rows and can add to them in place, so registering a
	// source never means leaving the page you are citing from.
	const registry = untrack(
		() => new DocumentRegistry(data.documentsDraft, data.session, toastNotifier, data.documentsRevision)
	);
	setDocumentRegistry(registry);
	$effect(() => registry.hydrate(data.documentsDraft, data.documentsRevision));

	// Live real-time refresh: subscribe to this project's change stream once; any
	// write (this tab's other pages, another tab, or the MCP) re-runs every open
	// page's load via invalidateAll, and stores re-hydrate from the fresh data,
	// no F5. Re-subscribes if the project changes; tears down on unmount.
	$effect(() => startLiveSync(data.projectId));

	// Tier guard: if the active capability is above the workspace tier, show an
	// upsell instead of the page (mirrors the dimmed sidebar entry).
	const activeCap = $derived(capabilityById(page.url.pathname.split('/')[3] ?? ''));
	const locked = $derived(!!activeCap && !tierAllows(data.tier, activeCap.tier));

	// Control Center is closed by default; the top-bar trigger and a keyboard
	// shortcut toggle it. Cmd/Ctrl-J is unbound elsewhere (K is left for search).
	let ccOpen = $state(false);
	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'j') {
				e.preventDefault();
				ccOpen = !ccOpen;
			}
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<TopBar
	projectId={data.projectId}
	sessionEmail={data.session?.email}
	memberName={data.memberName}
	workspaces={data.workspaces}
	activeWorkspace={data.activeWorkspace}
/>

<div class="flex min-h-0 flex-1">
	<Sidebar
		projectEyebrow={data.industryLabel}
		projectName={data.projectName}
		coherence={data.coherence}
		tier={data.tier}
		devTier={data.devTier}
		onOpenControlCenter={() => (ccOpen = true)}
	/>

	<main class="relative flex min-w-0 flex-1 flex-col">
		<!-- Non-blocking navigation feedback: shows the moment a link is clicked. -->
		<NavProgress />
		<!--
			Smooth capability transitions. SvelteKit already loads the target page
			without blocking; `page.url.pathname` only advances once the load resolves,
			so the current page stays on screen while the next one loads. Keying on the
			pathname means the incoming content mounts only when it is ready, then fades
			in (neutralized under prefers-reduced-motion via app.css).
		-->
		{#key page.url.pathname}
			<!-- App content background — tints every page's transparent
			     `flex-1 overflow-y-auto` scroll area in one place. -->
			<div class="flex min-h-0 min-w-0 flex-1 flex-col" style="background:#f1efff" in:fade={{ duration: 150 }}>
				{#if locked && activeCap}
					<LockedCapability capability={activeCap} currentTier={data.tier} />
				{:else}
					{@render children()}
				{/if}
			</div>
		{/key}
	</main>

	<ControlCenter
		coherence={data.productCoherence}
		trlBreakdown={data.trlBreakdown}
		projectName={data.projectName}
		scoreHistory={data.scoreHistory}
		sinceLastVisit={data.sinceLastVisit}
		bind:open={ccOpen}
	/>
</div>
