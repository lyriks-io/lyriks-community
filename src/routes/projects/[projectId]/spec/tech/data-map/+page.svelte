<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { FactItem } from '$application/spec360/tech';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import SpecDataMap from '$ui/spec360/SpecDataMap.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import FactRows from '$ui/spec360/FactRows.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SectionHead from '$ui/spec360/page/SectionHead.svelte';
	import { LEAD } from '$ui/spec360/page/look';
	import ViewEmpty from '$ui/spec360/tech/ViewEmpty.svelte';
	import type { PageData } from './$types';

	/**
	 * Tech and data · Data map: where the data lives and how it connects, in
	 * words (criterion 0f4c8334), then the interactive map of the tables in its
	 * dotted frame, a table's details a click away (criterion 3750dbba), then
	 * what the spec says of the data, each database opening the map on its
	 * tables (criterion e8a213be).
	 */
	let { data }: { data: PageData } = $props();
	const validation = useValidation();
	const hasTables = $derived(data.data.entities.length > 0);
	const intro = $derived(
		hasTables ? `${data.connections} Select a table to light its relations; its card opens its details.`.trim() : undefined
	);
	// A database named under the map opens the map on its tables (criterion e8a213be): the address carries it, the map filters on it.
	const databaseHref = (item: FactItem, index: number) => {
		const id = item.key === 'databases' ? item.chipRefs?.[index] : undefined;
		return id ? `?database=${encodeURIComponent(id)}` : null;
	};
	const MAP_BLOCK = anchorDomId('datamap');
	const describePrompt = $derived(
		`With the Lyriks MCP, on project ${data.projectId}, describe the data of the product: its tables, their fields and how they connect, from the code or from the documents you can read, in the data section (describe_section says how). Ask me what you cannot tell.`
	);
	$effect(() => {
		if (!page.url.searchParams.get('database')) return;
		const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		void tick().then(() => document.getElementById(MAP_BLOCK)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }));
	});
</script>

<section aria-label="Data map" class="flex animate-lk-in flex-col">
	{#if hasTables || data.summary}<p class={LEAD}>{data.summary ?? 'The data model is not described in the spec yet.'}</p>{/if}
	{#if data.notes.length}
		<div class="mt-3 flex flex-col gap-1.5 text-sm leading-[1.5] text-evo-muted">
			{#each data.notes as note (note.name)}
				<p class="m-0"><b class="font-semibold text-evo-ink-3">{note.name}</b> · {note.engine}. {note.description}</p>
			{/each}
		</div>
	{/if}

	{#if !hasTables}
		<!-- Nothing yet: what the view holds, what fills it, and the step that starts it (criterion 0b935dad). -->
		<div class="mt-5"><ViewEmpty headline="No table yet." text="Your AI describes the tables, their fields and how they connect, from the code or from a document, and you review them here." prompt={data.canWrite ? describePrompt : null} /></div>
	{:else}
	<div id={MAP_BLOCK} data-evo-waits={validation.waitsOnMe('datamap') || undefined} class="flex scroll-mt-36 flex-col gap-3">
		<SectionHead title="How the data connects" {intro}>
			{#snippet actions()}<SpecControls anchor="datamap" title="Datamap" />{/snippet}
		</SectionHead>
		<div class="-mt-1">
			<SpecDataMap
				data={data.data}
				session={data.session}
				derivedVisibility={data.derivedVisibility}
				tablesByFeature={data.tablesByFeature}
				cores={data.outline.cores}
				placements={data.placements}
				canMove={data.canWrite}
				places={data.places}
			/>
		</div>
		<!-- Its discussion at its foot, under the map. -->
		<BlockFoot anchor="datamap" title="Datamap" />
	</div>
	{/if}

	{#if data.facts.length}
		<div class="group/section">
			<SectionHead title="What the spec says of the data">
				{#snippet actions()}<SectionValidateAll anchors={data.facts.map((f) => anchorOf('data', f.key))} what="data facts" sectionId="kb-facts-data" />{/snippet}
			</SectionHead>
			<FactRows items={data.facts} kind="data" what="data facts" head={false} chipHref={databaseHref} />
		</div>
	{/if}
</section>
