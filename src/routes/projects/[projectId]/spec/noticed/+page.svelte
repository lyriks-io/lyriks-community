<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import { PRODUCT_CITE } from '$ui/spec360/page/head-cite';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { LIST, META } from '$ui/spec360/page/look';
	import FindingDrawer from '$ui/spec360/overview/FindingDrawer.svelte';
	import NoticedSection from '$ui/spec360/overview/NoticedSection.svelte';
	import { FindingDecisions } from '$ui/spec360/overview/finding-decisions.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { corePath } from '$ui/spec360/spec-nav';
	import { NOTICED_WAITS_FOR_FEATURE } from '$application/spec360/noticed';
	import { healthFigure, healthHint } from '$application/spec360/overview';
	import FigureTile from '$ui/spec360/overview/FigureTile.svelte';
	import type { PageData } from './$types';

	/**
	 * What Lyriks noticed, a page of its own in the Follow-up of the
	 * Specification 360° (criteria 55a7fe86, 14be32d5): every point the project
	 * health is computed from, non-blocking included, grouped by type
	 * (criteria 4189e074, 4996a6b4), each with its decisions (criterion
	 * e0f69b3c) and its sheet in a drawer, where its discussion is held. The
	 * Overview sums it up and leads here, on one type when its line was clicked
	 * (`?type=<type>`).
	 */
	let { data }: { data: PageData } = $props();
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const edits = useEdits();
	const decisions = untrack(() => new FindingDecisions(data.projectId, edits));
	const focus = $derived(page.url.searchParams.get('type'));
	const health = $derived(healthFigure(data.health, data.healthReading, null));

	// The drawer follows its point by id, so the page's next read (a decision landed) shows in it.
	let pointId = $state<string | null>(null);
	const openPoint = $derived(pointId ? ([...data.noticed.points, ...data.noticed.toConfirm].find((p) => p.finding.id === pointId) ?? null) : null);
	const featureHref = (id: string) => `${base}/${corePath(encodeURIComponent(id))}`;

</script>

{#snippet tools()}
	<AskAiTool anchor="product" title="Health" subject="What Lyriks noticed in {data.spec.productName}" />
{/snippet}

<div class="flex animate-lk-in flex-col">
	<PageHead
		kicker="Follow-up"
		up={{ label: 'Overview', href: base }}
		title="Health"
		lead="The score of the project, then everything that weighs on it, the heaviest first. Open a point to see where it comes from and what to do; reject it, or turn it into an evolution."
		{tools}
		cite={PRODUCT_CITE}
	>
		<!-- A reading of the whole project, not a fact of the specification: no discussion, no validation (criterion 4dadd4b8). -->
		<div class="mt-1 grid grid-cols-[minmax(0,340px)_1fr] items-center gap-x-6 gap-y-3 max-[700px]:grid-cols-1" id="kb-project-health">
			<FigureTile figure={health} />
			<p class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">{healthHint(data.health)}</p>
		</div>
	</PageHead>

	<SectionBox id="kb-noticed" title="Every point" intro="The heaviest first, grouped by type: open a type to read its points, a point to read its sheet.">
		{#if data.noticed.waitsForFeature}
			<div class={LIST}><p class="{META} m-0 px-5 py-[18px]">{NOTICED_WAITS_FOR_FEATURE}</p></div>
		{:else if data.healthReading}
			<!-- The project's first reading is taken behind; it lands here in place (ac-score-shown-at-once). -->
			<div class="{LIST} mb-3" role="status"><p class="{META} m-0 px-5 py-[18px]">Lyriks is reading the project health…</p></div>
		{/if}
		{#if data.noticed.waitsForFeature}
			<!-- Said above: nothing is listed before the first feature (criterion 01761816). -->
		{:else if data.noticed.total > 0 || data.noticed.toConfirm.length > 0}
			<NoticedSection view={data.noticed} {decisions} writable={data.canWrite} onOpen={(id) => (pointId = id)} {focus} />
		{:else if !data.healthReading}
			<div class={LIST}><p class="{META} m-0 px-5 py-[18px]">Nothing waits: Lyriks noticed no open point.</p></div>
		{/if}
	</SectionBox>
</div>

<FindingDrawer point={openPoint} {decisions} writable={data.canWrite} composing={decisions.composing(data.noticed.points)} {featureHref} onClose={() => (pointId = null)} />
