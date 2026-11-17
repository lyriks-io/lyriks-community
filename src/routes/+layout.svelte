<script lang="ts">
	import '../app.css';
	// Register bundled icons offline so nothing is fetched from api.iconify.design
	// at runtime (air-gap requirement). Side-effect import, must run before any
	// <Icon> renders, on both SSR and the client.
	import '$ui/icons/offline';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { ConfirmHost, FileViewerHost, ToastHost } from '$ui/design-system';
	import SourceReaderHost from '$ui/documents/SourceReaderHost.svelte';
	import UpdateBanner from '$ui/shell/UpdateBanner.svelte';
	import FeedbackHost from '$ui/shell/FeedbackHost.svelte';
	import TooltipHost from '$ui/shell/TooltipHost.svelte';
	import AppSidebar from '$ui/shell/AppSidebar.svelte';
	import TopBar from '$ui/shell/TopBar.svelte';
	import NavProgress from '$ui/shell/NavProgress.svelte';
	import SavingIndicator from '$ui/shell/SavingIndicator.svelte';
	import { shell } from '$ui/shell/shell-state.svelte';
	import { firstSteps } from '$ui/shell/first-steps-guide';
	import { watchNextToValidate } from '$ui/evolution/evo-scroll';
	import { landsAtTop } from '$ui/shell/lands-at-top';
	import { APP_FOOT_ID, FLOAT_DOCK_ID, PAGE_FLOAT_ID } from '$ui/shell/app-foot';
	import { heightVar } from '$ui/shell/height-var';
	import { ropeEdges } from '$ui/shell/rope-edges';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { navigationContextScope, projectNavigationContext, type ConfirmedNavigationContext } from '$ui/shell/project-navigation-context';
	import { EMPTY_APP_CHROME } from '$lib/shared/app-chrome';
	import { startPageReadRecovery } from '$ui/shell/page-read-recovery';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	const contextReading = $derived({
		scope: navigationContextScope({ authRequired: data.authRequired, isAuthenticated: !!data.session?.isAuthenticated, email: data.session?.email, sessionBoundary: data.navigationSessionBoundary, workspaceId: data.contextWorkspaceId ?? data.activeWorkspace ?? null }),
		project: data.currentProject,
		chrome: data.chrome,
		requestedProjectId: data.contextProjectId ?? data.currentProject?.id ?? null,
		addressedProjectId: page.params.projectId ?? null,
		unavailable: !!data.currentProjectUnavailable,
		denied: [401, 403, 404].includes(page.status)
	});
	let confirmedContext = $state<ConfirmedNavigationContext | null>(null);
	const navigationContext = $derived(projectNavigationContext(confirmedContext, contextReading));
	const currentProject = $derived(navigationContext?.project ?? null);
	const appChrome = $derived(!contextReading.scope || contextReading.denied ? EMPTY_APP_CHROME
		: data.currentProjectUnavailable ? navigationContext?.chrome ?? EMPTY_APP_CHROME : data.chrome);
	$effect(() => {
		const reading = contextReading;
		untrack(() => { confirmedContext = projectNavigationContext(confirmedContext, reading); });
	});
	let recovery: ReturnType<typeof startPageReadRecovery> | null = null;
	$effect(() => {
		if (!data.currentProjectUnavailable || !contextReading.scope || contextReading.denied) return;
		const reader = startPageReadRecovery(
			() => !!data.currentProjectUnavailable,
			() => navigating.to !== null || document.visibilityState === 'hidden',
			() => invalidateAll()
		);
		recovery = reader;
		return () => { reader.stop(); if (recovery === reader) recovery = null; };
	});

	// A deterministic readiness signal for browser automation: SSR visibility
	// alone does not mean event handlers have been installed yet.
	let hydrated = $state(false);
	onMount(() => {
		shell.folded = data.navFolded;
		hydrated = true;
	});
	// The navigation folded as this browser left it, from the first paint (criterion 53c5c6f0).
	const navFolded = $derived(hydrated ? shell.folded : data.navFolded);

	// Every page of the app wears the navigation and the top bar; the pages before
	// one is signed in (login, join, activation) stand alone.
	const chrome = $derived(
		page.url.pathname === '/' ||
			page.url.pathname.startsWith('/projects/') ||
			page.url.pathname.startsWith('/settings') ||
			page.url.pathname.startsWith('/documentation')
	);
	// A button leading to another page opens it at its top: pages scroll in #app-scroll, which the router never scrolls.
	afterNavigate(({ from, to, type }) => {
		if (to && landsAtTop(from?.url ?? null, to.url, type)) document.getElementById('app-scroll')?.scrollTo({ top: 0 });
	});

	const steps = $derived(firstSteps({ hasProject: !!currentProject, ...appChrome.progress }, currentProject?.id ?? null));
</script>

<div data-lyriks-hydrated={hydrated} data-nav-folded={navFolded ? '' : undefined} {@attach ropeEdges} class="lk-shell flex h-screen flex-col overflow-hidden bg-evo-page font-evo text-[0.9375rem] leading-normal text-evo-ink">
	{#if data.isAdmin}
		<UpdateBanner />
	{/if}
	{#if chrome}
		<div class="relative flex min-h-0 flex-1">
			{#key `${contextReading.scope ?? 'none'}:${contextReading.denied ? 'denied' : data.currentProjectUnavailable ? 'unavailable' : 'ready'}`}
			<AppSidebar
				current={currentProject}
				chrome={appChrome}
				folded={navFolded}
				{steps}
				email={data.session?.email}
				memberName={data.memberName}
				workspaces={data.workspaces}
				activeWorkspace={data.activeWorkspace}
			/>
			{/key}
			<div class="flex min-w-0 flex-1 flex-col">
				<TopBar />
				<NavProgress />
				<SavingIndicator />
				{#if data.currentProjectUnavailable && !contextReading.denied}
					<div class="flex items-center gap-3 border-b border-line bg-toner-2 px-4 py-2 text-sm" role="status">
						<span>Project temporarily unavailable. Retrying…</span>
						<button type="button" class="font-semibold underline" onclick={() => void recovery?.retry()}>Retry</button>
					</div>
				{/if}
				<div class="relative flex min-h-0 flex-1 flex-col">
					<!-- The one scroller of the app: the top bar stays above it, the navigation beside it, and pages scroll in it. -->
					<div id="app-scroll" {@attach watchNextToValidate} class="evo-motion relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-evo-page">
						{@render children()}
					</div>
				</div>
				<!-- The page's foot actions (PageFoot), in view under the scroller; what floats at the bottom rises above it (--app-foot-h). -->
				<div id={APP_FOOT_ID} class="relative z-10 flex-none empty:hidden" {@attach heightVar('--app-foot-h')}></div>
			</div>
		</div>
		<!-- What floats at the bottom left of every page, right of the navigation, above its foot: a page's own button; the reader's AI reads in the top bar (ac-ai-session-band). -->
		<div id={FLOAT_DOCK_ID} class="pointer-events-none fixed bottom-[calc(var(--app-foot-h,0px)+16px)] left-[calc(var(--side-w)+16px)] z-40 flex max-w-[calc(100vw-var(--side-w)-32px)] items-end gap-2 *:pointer-events-auto">
			<div id={PAGE_FLOAT_ID} class="contents"></div>
		</div>
	{:else}
		<div class="relative flex flex-1 flex-col overflow-hidden">
			{@render children()}
		</div>
	{/if}
	<ConfirmHost />
	<FileViewerHost />
	<SourceReaderHost />
	<ToastHost />
	<FeedbackHost />
	<TooltipHost />
</div>

<style>
	/* The width of the navigation, for what sits right of it (the floating dock, the panels, the bars a page
	   portals under body): folded to its icons or not, none on a phone or on a page without the navigation.
	   Set on the root so what is portalled out of the shell reads it too. */
	:global(:root) {
		--side-w: 0px;
	}
	:global(:root:has(.lk-shell [data-app-bar])) {
		--side-w: 248px;
	}
	:global(:root:has(.lk-shell[data-nav-folded] [data-app-bar])) {
		--side-w: 64px;
	}
	@media (max-width: 980px) {
		:global(:root:has(.lk-shell [data-app-bar])),
		:global(:root:has(.lk-shell[data-nav-folded] [data-app-bar])) {
			--side-w: 0px;
		}
	}
</style>
