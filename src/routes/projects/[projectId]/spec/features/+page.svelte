<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { addedLast } from '$application/spec360/edits';
	import { productRuleAnchor } from '$application/spec360/product-rules';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import NewBadge from '$ui/spec360/NewBadge.svelte';
	import { useSpecNews } from '$ui/spec360/spec-news.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import { PRODUCT_CITE } from '$ui/spec360/page/head-cite';
	import OpenRow from '$ui/spec360/page/OpenRow.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { corePath } from '$ui/spec360/spec-nav';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import type { PageData } from './$types';

	/**
	 * Features, where the chapter opens (criterion 64fa19d5): the core features,
	 * the areas of the product, from A to Z, each with its description and the
	 * number of its features named, with no bar (criterion 41a9c9d6; none of
	 * them listed: a core feature opens its own page, which lists them), its
	 * name and description fields in the Edit mode (criterion 41514698), then
	 * the rules the whole product keeps (ac-rules-product-card), each in a box.
	 * Each row carries its own validation beside its navigation link (criteria
	 * 74f14936, 89d4c960); what entered or changed in it lately reads New
	 * or Changed until the reader opens it (criteria 2a6bff42, b0950115).
	 * Every element of every feature still waiting on the reader is validated
	 * from the band's Validate the whole section, which no check in the head repeats
	 * (criterion d7cd4e43).
	 */
	let { data }: { data: PageData } = $props();
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const validation = useValidation();
	const news = useSpecNews();
	const waits = (anchor: string) => validation.waitsOnMe(anchor) || undefined;
	const edits = useEdits();
	const mode = useEditMode();
	// Shaping is a draft's, in its Edit mode, for whoever may write it (criterion 9f27d93b).
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite);
	// A core feature added here shows at the foot of the list until its name is written, then takes its alphabetical
	// place (criterion 13b2a68a), as on the Overview.
	const cores = $derived(
		addedLast(
			[
				...data.list.cores.filter((c) => !edits.gone(anchorOf('core', c.id))),
				...edits.added('core', data.list.cores.map((c) => c.id)).map((a) => ({ id: a.id, name: a.name, description: '', features: [] as unknown[] }))
			],
			(c) => edits.naming(anchorOf('core', c.id))
		)
	);
	const ruleAnchors = $derived(data.list.productRules.map((r) => productRuleAnchor(r.id)));

</script>

<div id="spec-features-list" class="flex animate-lk-in flex-col">
	<PageHead title="Features" lead="Everything {data.spec.productName} does, grouped into {cores.length} {cores.length === 1 ? 'area' : 'areas'}." cite={PRODUCT_CITE}>
		{#snippet tools()}
			<!-- The one way the page asks the reader's AI, posted in About the product's thread (criterion 44aa7b4f). -->
			<AskAiTool anchor="product" title="Features" subject="the features of {data.spec.productName}" />
		{/snippet}
	</PageHead>

	<div class="flex flex-col gap-6">
		<SectionBox title="Core features" intro={cores.length ? 'Open a core feature to read its features.' : undefined}>
			{#if cores.length === 0}
				<p class="m-0 text-sm text-ink-3"><b class="text-ink">No core feature yet.</b> The specification holds no area of the product to list.</p>
			{:else}
				<ul class="m-0 grid list-none gap-2 p-0" aria-label="Core features">
					{#each cores as core (core.id)}
						{@const mark = news?.badgeOf(core.id)}
						{@const anchor = anchorOf('core', core.id)}
						<!-- In the Edit mode its name and description are fields, held until Save (criterion 41514698). -->
						<li id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="scroll-mt-44">
							<OpenRow {anchor} name={core.name} description={core.description} href="{base}/{corePath(encodeURIComponent(core.id))}" count={core.features.length} unit="feature">
								{#snippet badge()}{#if mark}<NewBadge news={mark} />{/if}{/snippet}
								<!-- The same acts as a term of the Glossary or an action (criterion 74f14936); its comments and sources close its text. -->
								{#snippet controls()}<SpecControls anchor={anchor} title={core.name} inline cites trailing />{/snippet}
							</OpenRow>
						</li>
					{/each}
				</ul>
			{/if}
			{#if editable}
				<AddButton label="Add a core feature" onclick={() => void edits.add('core')} />
			{/if}
		</SectionBox>

		{#if data.list.productRules.length}
			<SectionBox id="spec-product-rules" title="Rules the whole product keeps" intro="What holds everywhere in the product, whatever the feature.">
				{#snippet actions()}<SectionValidateAll anchors={ruleAnchors} what="rules" sectionId="spec-product-rules" />{/snippet}
				<div class="grid gap-2">
					{#each data.list.productRules as rule (rule.id)}
						{@const anchor = productRuleAnchor(rule.id)}
						<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-44 flex-col gap-1.5 border border-line bg-toner px-4 py-3">
							<div class="flex flex-wrap items-center gap-2.5">
								<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] leading-normal [overflow-wrap:anywhere]"><EarsText text={rule.text} /></span>
								<SpecControls {anchor} title={rule.text} />
							</div>
							<BlockFoot {anchor} title={rule.text} />
						</div>
					{/each}
				</div>
			</SectionBox>
		{/if}
	</div>
</div>
