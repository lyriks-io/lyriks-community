<script lang="ts">
	import '../app.css';
	// Register bundled icons offline so nothing is fetched from api.iconify.design
	// at runtime (air-gap requirement). Side-effect import, must run before any
	// <Icon> renders, on both SSR and the client.
	import '$ui/icons/offline';
	import type { Snippet } from 'svelte';
	import { ConfirmHost, FileViewerHost, ToastHost, Icon } from '$ui/design-system';
	import type { Component } from 'svelte';
	import UpdateBanner from '$ui/shell/UpdateBanner.svelte';
	import FeedbackHost from '$ui/shell/FeedbackHost.svelte';
	import { tierLabel } from '$domain/tier/tier';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	// The header workspace switcher belongs to the Enterprise overlay; the
	// glob resolves to nothing in the open-source tree.
	const switcherModules = import.meta.glob<{ default: Component<{ workspaces: LayoutData['workspaces']; active: string | null }> }>(
		'/src/lib/ee/ui/shell/WorkspaceSwitcher.svelte',
		{ eager: true }
	);
	const WorkspaceSwitcher = Object.values(switcherModules)[0]?.default ?? null;
	// Only shown for a real authenticated user (dev session has no email),
	// so plain dev is visually unchanged.
	const email = $derived(data.session?.email);
	// Routes that draw their own top bar (portfolio home, every project page and
	// settings via TopBar) carry the workspace/user chrome themselves, so this
	// floating cluster would overlap them, so suppress it there. Header-less routes
	// (login, join) keep it as their only logout/nav affordance.
	const ownsHeader = $derived(
		page.url.pathname === '/' ||
			page.url.pathname.startsWith('/projects/') ||
			page.url.pathname.startsWith('/settings')
	);
</script>

<div class="flex h-screen flex-col overflow-hidden bg-canvas text-ink-700">
	{#if data.isAdmin}
		<UpdateBanner />
	{/if}
	<!-- The positioning context starts BELOW the update notice, so the floating
	     chrome cluster anchors under it instead of overlapping it when it shows. -->
	<div class="relative flex flex-1 flex-col overflow-hidden">
	{#if !ownsHeader}
	<div class="absolute right-3 top-3 z-50 flex items-center gap-2">
		{#if data.devTier}
			<span
				class="rounded-pill border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur"
				title="Active development edition"
			>
				Dev · {tierLabel(data.devTier)}
			</span>
		{/if}
		{#if WorkspaceSwitcher}
			<WorkspaceSwitcher workspaces={data.workspaces} active={data.activeWorkspace} />
		{/if}
		<a
			href="/settings"
			class="grid size-8 place-items-center rounded-pill border border-white/25 bg-white/15 text-white/80 backdrop-blur transition-colors hover:bg-white/25 hover:text-white"
			title="Settings"
			aria-label="Settings"
		>
			<Icon name="sliders" size={15} />
		</a>
		{#if email}
			<form
				method="POST"
				action="/logout"
				class="flex items-center gap-2 rounded-pill border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur"
			>
				<span class="max-w-40 truncate font-medium text-white">{email}</span>
				<button type="submit" class="font-semibold text-white/90 transition-colors hover:text-white">
					Log out
				</button>
			</form>
		{/if}
	</div>
	{/if}
	{@render children()}
	</div>
	<ConfirmHost />
	<FileViewerHost />
	<ToastHost />
	<FeedbackHost />
</div>
