<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import CiteLinks from '$ui/spec360/CiteLinks.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { addedLast } from '$application/spec360/edits';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import StagedTags from '$ui/spec360/StagedTags.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import { PRODUCT_CITE } from '$ui/spec360/page/head-cite';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import { CHIP, LABEL, LIST } from '$ui/spec360/page/look';
	import type { PageData } from './$types';

	/**
	 * Glossary (criterion badcf09f): each governed term, the count of its uses
	 * (the term and its allowed synonyms, across the whole spec, no bar:
	 * criterion 41a9c9d6), its definition and its allowed synonyms ('Also:'); its
	 * words to avoid are not listed here (they are marked where the spec writes
	 * them). The count unfolds where the uses are. A link from a feature (`?term=`) opens
	 * the term it names. Each term is discussed and validated; in the Edit mode
	 * (criterion 41514698) its name and definition are fields and its synonyms a
	 * list of fields, held until Save.
	 */
	let { data }: { data: PageData } = $props();
	let openTerm = $state<string | null>(untrack(() => page.url.searchParams.get('term')));

	$effect(() => {
		const id = page.url.searchParams.get('term');
		if (!id) return;
		untrack(() => {
			openTerm = id;
			requestAnimationFrame(() =>
				document.getElementById(anchorDomId(anchorOf('term', id)))?.scrollIntoView({ behavior: scrollMotion(), block: 'center' })
			);
		});
	});
	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	// Adding is a draft's, in its Edit mode, for whoever may write it (criterion 51e215ef).
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite);
	// A term added here shows at the foot until it is named, then takes its place (criterion 51e215ef).
	const entries = $derived(
		addedLast(
			[
				...data.entries,
				...edits.added('term', data.entries.map((t) => t.id)).map((a) => ({ id: a.id, term: a.name, definition: '', synonyms: [] as string[], uses: 0, places: [] as { place: string; uses: number }[], where: [] as string[] }))
			],
			(t) => edits.naming(anchorOf('term', t.id))
		)
	);
	const n = $derived(entries.length);
</script>

<section id="kb-glossary" aria-label="Glossary" class="group/section flex animate-lk-in flex-col">
	<PageHead title="Glossary" lead={n ? `The ${n === 1 ? 'word' : `${n} words`} the specification uses, with how often ${n === 1 ? 'it appears' : 'each one appears'}.` : undefined} cite={PRODUCT_CITE}>
		<!-- Ask my AI, the one way the page asks the reader's AI, posts in About the product's thread (criterion 44aa7b4f). -->
		{#snippet tools()}<AskAiTool anchor="product" title="Glossary" subject="the glossary of {data.spec.productName}" />{/snippet}
	</PageHead>

	{#if n === 0}
		<p class="m-0 mt-6 text-[0.9375rem] text-evo-muted">No term in the glossary yet.</p>
	{:else}
		<!-- Validate all over the list, at its right; nothing holds the row once nothing waits on the reader. -->
		<div class="mt-4 flex min-h-2 justify-end"><SectionValidateAll anchors={data.entries.map((t) => anchorOf('term', t.id))} what="terms" sectionId="kb-glossary" /></div>
		<div class="{LIST} mt-1">
			{#each entries as t (t.id)}
				{@const anchor = anchorOf('term', t.id)}
				{@const open = openTerm === t.id}
				{@const read = { text: t.term, desc: t.definition, tags: t.synonyms }}
				{@const e = edits.shown(anchor, read)}
				<div id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="flex scroll-mt-36 flex-col border-t border-evo-line-soft px-[18px] py-4 first:border-t-0">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
						<h3 class="m-0 min-w-0 flex-1 basis-[200px] text-lg leading-[1.2] font-bold tracking-[-0.01em] text-evo-ink">
							<StagedText {anchor} {read} field="text" label="Term">{e.text}</StagedText>
						</h3>
						<button
							type="button"
							aria-expanded={open}
							aria-label="{t.uses} {t.uses === 1 ? 'use' : 'uses'} in the spec: {open ? 'hide' : 'show'} where"
							title="Where the spec uses it"
							onclick={() => (openTerm = open ? null : t.id)}
							class="group/uses -mx-1.5 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-1.5 text-[0.8125rem] text-evo-muted transition-colors duration-150 hover:bg-evo-hover"
						>
							<span class="text-right"><b class="font-evo-mono text-evo-ink tabular-nums">{t.uses}</b>&nbsp;{t.uses === 1 ? 'use' : 'uses'}</span>
							<svg class="flex-none text-ink transition-transform duration-200 {open ? 'rotate-90' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
						</button>
						<!-- The same acts as every list of Knowledge; its comments and sources close its definition (criteria 74f14936, 57ee9b9b). -->
						<SpecControls {anchor} title="Term · {e.text}" values={e} inline cites trailing />
					</div>
					<InlineEditor {anchor} />
					{#if edits.editing !== anchor}
						<div class="mt-2 text-[0.9375rem] leading-[1.55] text-evo-ink-2 empty:hidden">
							<StagedText {anchor} {read} field="desc" multiline label="Definition"><p class="m-0">{e.desc}<CiteLinks {anchor} /></p></StagedText>
						</div>
						<div class="mt-1.5 empty:hidden">
							<StagedTags {anchor} {read} noun="synonym" itemClass="font-evo-mono text-xs leading-[1.3] text-ink-2">
								{#if e.tags?.length}<span class="block font-evo-mono text-xs leading-[1.3] text-ink-3">Also: {e.tags.join(', ')}</span>{/if}
							</StagedTags>
						</div>
					{/if}
					{#if open}
						<div class="mt-3 flex animate-lk-in-fast flex-col gap-2.5 bg-evo-sunken px-3.5 py-3">
							{#if t.places.length}
								<div class="flex flex-wrap gap-2">
									{#each t.places as p (p.place)}
										<span class="inline-flex items-baseline gap-2 bg-surface px-3 py-1.5">
											<b class="font-evo-mono text-lg text-ink tabular-nums">{p.uses}</b>
											<span class="text-[0.8125rem] text-evo-ink-3">{p.place}</span>
										</span>
									{/each}
								</div>
							{:else}
								<span class="text-[0.8125rem] text-evo-muted">The spec does not use this term yet.</span>
							{/if}
							{#if t.where.length}
								<span class="{LABEL} text-evo-muted">Where it appears</span>
								<div class="flex flex-wrap gap-1.5">
									{#each t.where as w (w)}
										<span class="{CHIP} px-2.5 py-[3px]">{w}</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
					<div class="has-[*]:mt-3"><BlockFoot {anchor} title="Term · {e.text}" /></div>
				</div>
			{/each}
		</div>
	{/if}
	{#if editable}<AddButton label="Add a term" onclick={() => void edits.add('term')} />{/if}
</section>
