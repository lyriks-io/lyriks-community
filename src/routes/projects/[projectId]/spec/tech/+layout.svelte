<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { anchorOf } from '$domain/discussions';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import ChipNav from '$ui/spec360/page/ChipNav.svelte';
	import { TECH_TABS, specPathOf } from '$ui/spec360/spec-nav';

	/**
	 * Tech and data: one title over its five views (Data map, Architecture,
	 * Operations, Requirements, Sources), switched by the chips under it; each view
	 * is its own page, so a link reaches it. The head carries the tools of the
	 * view on screen (criterion 14a1164c): Edit, its comments, and Ask my AI
	 * about its first block (criterion 44aa7b4f).
	 */
	let { children }: { children: Snippet } = $props();
	const projectId = $derived(page.params.projectId ?? '');
	const base = $derived(`/projects/${encodeURIComponent(projectId)}/spec`);
	const path = $derived(specPathOf(page.url.pathname, projectId));
	const tabs = $derived(TECH_TABS.map((t) => ({ href: `${base}/${t.path}`, label: t.label, current: path === t.path })));
	const tab = $derived(TECH_TABS.find((t) => t.path === path) ?? null);

	/** What Ask my AI bears on, per view: its first block; the register of sources is not discussed. */
	const ASKED: Readonly<Record<string, { anchor: string; title: string }>> = {
		'tech/data-map': { anchor: 'datamap', title: 'Datamap' },
		'tech/architecture': { anchor: 'stack', title: 'Architecture' },
		'tech/operations': { anchor: anchorOf('health', 'environments'), title: 'Environments' },
		'tech/requirements': { anchor: anchorOf('requirements', 'runtime'), title: 'Runtime' }
	};
	const asked = $derived(ASKED[path] ?? null);
	const productName = $derived((page.data as { spec?: { productName?: string } }).spec?.productName ?? 'the product');
</script>

{#snippet tools()}
	{#if asked && tab}<AskAiTool anchor={asked.anchor} title={asked.title} subject="the {tab.label.toLowerCase()} of {productName}" />{/if}
{/snippet}

<PageHead title="Technology & data" {tools} cite={asked}>
	<ChipNav label="Technology & data views" items={tabs} />
</PageHead>
{@render children()}
