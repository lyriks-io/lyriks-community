<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { pageKey } from '$ui/shell/page-key';
	import LockedCapability from '$ui/shell/LockedCapability.svelte';
	import { capabilityById } from '$ui/shell/capabilities';
	import { tierAllows } from '$domain/tier';
	import { startLiveSync } from '$ui/shell/live-sync.client';
	import { setGlossaryTerms } from '$ui/glossary/glossary-context';
	import { setSpecLanguage } from '$ui/language/spec-language-context';
	import { DocumentRegistry, setDocumentRegistry } from '$ui/documents/registry.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import { ProjectAiSession, provideProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';
	import { aiSessionSlot } from '$ui/ai-session/ai-session-slot.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Provide the governed vocabulary to every capability page. The accessor reads
	// `data` live, so terms added on the Glossary page propagate via live-sync.
	setGlossaryTerms(() => data.glossaryTerms);
	setSpecLanguage(() => data.specLanguage.generated);

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
	// no F5. Re-subscribes if the project changes; tears down on unmount. Read
	// through a derived id: every reload hands a new `data`, and re-subscribing on
	// it dropped the refresh still pending and the changes sent while reconnecting.
	const projectId = $derived(data.projectId);
	$effect(() => startLiveSync(projectId));

	// The reader's session with their own AI on the whole project, one for every page of it (feat-ai-session).
	// It reads the project on screen through the derived id (every reload hands a new `data`, the id
	// changes only with the project): this layout stays mounted when the reader moves to another project.
	const aiSession = new ProjectAiSession(() => projectId, () => data.projectName, () => data.canWrite, () => data.edition ?? null);
	provideProjectAiSession(aiSession);
	$effect(() => aiSession.listen());
	// The floating chip reads it from above the project's pages (ac-ai-session-band).
	$effect(() => {
		aiSessionSlot.session = aiSession;
		return () => {
			if (aiSessionSlot.session === aiSession) aiSessionSlot.session = null;
		};
	});

	// Tier guard: if the active capability is above the workspace tier, show an
	// upsell instead of the page (mirrors the dimmed sidebar entry).
	const activeCap = $derived(capabilityById(page.url.pathname.split('/')[3] ?? ''));
	const locked = $derived(!!activeCap && !tierAllows(data.tier, activeCap.tier));
</script>

<!-- Ask my AI on every page of the project: a page that names no block of its own asks about the page itself (rule 8ddf1393). -->
<AskAiTool onPage />
<!--
	Smooth page transitions. SvelteKit loads the target page without blocking;
	`page.url.pathname` only advances once the load resolves, so the current page
	stays on screen while the next one loads, then the incoming one fades in
	(kept as a fade under prefers-reduced-motion: data-reduced-fade, app.css). Pages that share a
	frame keep it and swap only their content (pageKey).
-->
{#key pageKey(page.url.pathname)}
	<div class="page-scroll-host flex min-h-0 min-w-0 flex-1 flex-col" data-reduced-fade in:fade={{ duration: 150 }}>
		{#if locked && activeCap}
			<LockedCapability capability={activeCap} currentTier={data.tier} />
		{:else}
			{@render children()}
		{/if}
	</div>
{/key}
