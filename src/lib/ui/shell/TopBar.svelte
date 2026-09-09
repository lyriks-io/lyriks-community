<script lang="ts">
	import { Logo } from '$ui/design-system';
	import FeedbackButton from '$ui/shell/FeedbackButton.svelte';
	import GlobalSearch from '$ui/portfolio/GlobalSearch.svelte';
	import ProjectSearch from '$ui/shell/ProjectSearch.svelte';
	import UserMenu from '$ui/shell/UserMenu.svelte';
	import type { WorkspaceSummary } from '$application/ports';
	// Edition badge, Control Center and the behavior link live in the left Sidebar;
	// member management lives in Settings → Members; the page's "?" belongs to the
	// page itself (PageHeading), which is what freed this bar of an element it had
	// to position over the body beneath it. What is left is deliberately lean:
	// logo · search · feedback · user. THE app-wide navigation bar — the portfolio home and
	// every project page render this same component so the chrome never drifts.

	interface Props {
		/** Present inside a project; scopes the search and the user menu's tools. */
		projectId?: string;
		/** Signed-in user's email; drives the user menu (absent for the dev session). */
		sessionEmail?: string;
		/** The app-wide resolved name of the active user, shown in the user menu. */
		memberName?: string;
		/** Caller's teams + active one — the user menu's workspace switcher. */
		workspaces?: WorkspaceSummary[];
		activeWorkspace?: string | null;
	}
	let {
		projectId,
		sessionEmail,
		memberName,
		workspaces = [],
		activeWorkspace = null
	}: Props = $props();
</script>

<!--
	z-[45]: the header is its own stacking context, so the menus it drops
	(user menu, project search) can never rise above it. Side panels such as the
	Control Center sit at z-40 and modal overlays at z-50; the header therefore
	stands between them, or a menu opened while the panel is open lands behind it.
-->
<header class="bg-brand-gradient relative z-[45] flex h-14 shrink-0 items-center gap-4 px-5 text-white shadow-lg shadow-violet-500/10">
	<a href="/" class="flex items-center gap-2 rounded-lg font-display text-lg font-bold tracking-tight outline-none transition hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Lyriks home">
		<Logo size={26} />
		Lyriks
	</a>

	<!-- Right-aligned cluster, identical shape everywhere so the bar
	     doesn't shift when you enter or leave a project. -->
	<div class="ml-auto flex flex-1 items-center justify-end gap-3">
		{#if projectId}
			<!-- Inside a project: search every object in THIS project. -->
			<ProjectSearch {projectId} tone="dark" />
		{:else}
			<GlobalSearch tone="dark" />
		{/if}
		<FeedbackButton />
		<UserMenu email={sessionEmail} {memberName} {workspaces} {activeWorkspace} {projectId} />
	</div>
</header>
