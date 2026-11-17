<script lang="ts">
	import { sortByName } from '$domain/shared';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import CiteLinks from '$ui/spec360/CiteLinks.svelte';
	import FeatureValidation from '$ui/spec360/FeatureValidation.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { FACT, LIST, META } from '$ui/spec360/page/look';
	import CoreList from '$ui/spec360/overview/CoreList.svelte';
	import FigureTile from '$ui/spec360/overview/FigureTile.svelte';
	import NoticedSummary from '$ui/spec360/overview/NoticedSummary.svelte';
	import ProblemTarget from '$ui/spec360/overview/ProblemTarget.svelte';
	import UserList from '$ui/spec360/overview/UserList.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { corePath } from '$ui/spec360/spec-nav';
	import { addedLast } from '$application/spec360/edits';
	import { classificationChips } from '$application/spec360/glance';
	import { paragraphsOf } from '$application/spec360/labels';
	import { LIMITS } from '$domain/foundation';
	import { NOTICED_WAITS_FOR_FEATURE, noticedTypeKey } from '$application/spec360/noticed';
	import { FINAL_CHECK_KIND } from '$domain/retrospec';
	import { overviewFigures } from '$application/spec360/overview';
	import type { PageData } from './$types';

	/**
	 * The Overview, first page of the Specification 360° (criterion 416e4885):
	 * its title is the product's name at the top of Knowledge, DRAFT and Edit
	 * after it (criterion 8e942b12), so it opens on About the product (its
	 * summary, its type grouped by what it fills, its sources and validation), its four
	 * figures, then each section boxed: why it exists, what it does, and side
	 * by side who uses it and the summary of What Lyriks noticed, whose list
	 * has a page of its own (criterion 55a7fe86). Every block of the product's
	 * own is edited in place in the Edit mode (criterion 41514698); its users
	 * are read only here (criterion 90232fe6). The page is acted on frame by
	 * frame for fresh approvals (criterion 416e4885): while a
	 * draft About the product, Why it exists, What it does and Who uses it each
	 * validate as a whole, and every frame takes the comments of the whole frame, their thread
	 * at its foot. A reviewed card keeps its own confirmed check for personal
	 * withdrawal (criterion f2eabcd9); individual fresh approval is on its own
	 * page. Ask my AI posts in About the product's thread (criterion 44aa7b4f).
	 * Where the specification stands, and where the page's validation stands,
	 * read in the band at the top of Knowledge (criterion f480783f); its
	 * Reverse-Specifications are the Reverse page's (criterion 2dbed801).
	 */
	let { data }: { data: PageData } = $props();
	const g = $derived(data.glance);
	const projectPath = $derived(`/projects/${encodeURIComponent(data.projectId)}`);
	const base = $derived(`${projectPath}/spec`);
	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	// Editing in place is a draft's while Code drift cannot follow a hand edit (criterion 9b3e04e1, 611e98cb on hold),
	// and its controls wait for the page's Edit mode (criterion 41514698).
	const editable = $derived(validation.draft && data.canWrite && mode.active);
	const editingProduct = $derived(edits.editing === 'product');

	// What the page shows: what it read, with the edits, adds and deletes on their way laid over it.
	const productRead = $derived({ text: g.brief, classification: g.classification });
	const product = $derived(edits.shown('product', productRead));
	// The whole summary, 500 characters at most, with no Read more: the text its field holds in the Edit mode is the
	// text read outside it (criteria 416e4885, 72251131).
	const summaryShown = $derived(paragraphsOf(product.text ?? ''));
	// Nothing written yet: in the Edit mode the summary is the first thing to fill, and says so (criterion 7d0d0a45).
	const summaryToFill = $derived(editable && !g.pitch && !(edits.current('product', productRead).text ?? '').trim());
	const meta = $derived(edits.edited('product') && product.classification ? classificationChips(product.classification) : g.meta);
	const problem = $derived(edits.shown('problem', { text: g.problem, tags: g.symptoms }));
	// The target's results are its KPIs, named: a field each in the Edit mode (criterion 416e4885).
	const target = $derived(edits.shown('target', { text: g.target, tags: g.outcomes.map((o) => o.label) }));
	const users = $derived(g.users.filter((u) => !edits.gone(anchorOf('role', u.id))));
	// From A to Z; a core added here is named at the foot, where Add a core feature was clicked, and takes its
	// alphabetical place once its editor closes (criterion 4b3d2b4d).
	const cores = $derived(
		addedLast(
			sortByName([
				...g.cores.filter((c) => !edits.gone(anchorOf('core', c.id))),
				...edits.added('core', g.cores.map((c) => c.id)).map((a) => ({ id: a.id, name: a.name, description: '', featureCount: '0 features', features: 0 }))
			]),
			(c) => edits.naming(anchorOf('core', c.id))
		)
	);
	const features = $derived(cores.reduce((n, c) => n + c.features, 0));
	// Health opens on the type that weighs most, unfolded (criterion b6b34ed0): types read heaviest first.
	// The Final check holds the blocking points, so it leads when there is one.
	const heaviestType = $derived(data.noticed.types.find((t) => t.key === noticedTypeKey(FINAL_CHECK_KIND.label)) ?? data.noticed.types[0]);
	const healthHref = $derived(`${base}/noticed${heaviestType ? `?type=${encodeURIComponent(heaviestType.key)}` : ''}`);
	const figures = $derived(overviewFigures({ cores, users, health: g.health, healthReading: g.healthReading, noticed: data.noticed, healthHref }));

	const hasProblem = $derived(!!(g.problem || g.symptoms.length));
	const hasTarget = $derived(!!(g.target || g.outcomes.length));
	const hasWhy = $derived(hasProblem || hasTarget);
	const why = $derived([hasProblem && 'problem', hasTarget && 'target'].filter(Boolean) as string[]);
	const coreAnchors = $derived(cores.map((c) => anchorOf('core', c.id)));
	// Who uses it validates its profiles as a whole while a draft, as Users validates them (criterion 90232fe6).
	const userAnchors = $derived(users.map((u) => anchorOf('role', u.id)));
	// The frames the page discusses as wholes (criterion 416e4885); the head carries no comments, About the product's sit just under it.
	const FRAME = { why: anchorOf('overview', 'why'), what: anchorOf('overview', 'what'), who: anchorOf('overview', 'who'), noticed: anchorOf('overview', 'noticed') };
	/** Every element the page's frames validate, the profiles of Who uses it included (criterion 416e4885). */
	const pageAnchors = $derived([...(g.pitch ? ['product'] : []), ...why, ...coreAnchors, ...userAnchors]);
	const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
	const userHref = (id: string) => `${base}/users/${encodeURIComponent(id)}`;
	const coreHref = (id: string) => `${base}/${corePath(encodeURIComponent(id))}`;
	const noticedIntro = $derived(
		data.noticed.waitsForFeature
			? NOTICED_WAITS_FOR_FEATURE
			: g.healthReading && data.noticed.total === 0
			? 'Lyriks is reading the project health…'
			: data.noticed.pending > 0
				? `${plural(data.noticed.pending, 'point')} to review, the heaviest first.`
				: data.noticed.total > 0
					? 'Every point is settled.'
					: 'Nothing waits: Lyriks noticed no open point.'
	);
</script>

<!-- Ask my AI shows at the foot of the navigation (criterion 44aa7b4f); the page declares what it bears on. -->
<AskAiTool anchor="product" title="Product summary" subject={data.spec.productName} />

<!-- A frame discussed as a whole: its comments beside its section's other acts, its thread at its foot (criterion 416e4885). -->
{#snippet frameComments(anchor: string, title: string)}<SpecControls {anchor} {title} validates={false} />{/snippet}
{#snippet frameFoot(anchor: string, title: string)}<div id={anchorDomId(anchor)} class="mt-4 flex scroll-mt-36 flex-col gap-2 empty:hidden"><BlockFoot {anchor} {title} /></div>{/snippet}

<div id="kb-glance" class="flex animate-lk-in flex-col">
	<!-- No head of its own: the product's name, DRAFT and Edit are the top of Knowledge (criteria 8e942b12, 416e4885). -->
	<PageHead title={data.spec.productName} bare>
		{#if !editingProduct}
			<div id={anchorDomId('product')} data-evo-waits={validation.waitsOnMe('product') || undefined} class="flex scroll-mt-36 flex-col gap-1.5">
				<span class="font-evo-mono text-[0.625rem] leading-[1.3] tracking-[0.08em] text-ink-3 uppercase">About the product</span>
				<div class="flex flex-col gap-1.5 {summaryToFill ? 'border-[1.5px] border-dashed border-orange-ink bg-orange-tint/40 px-3 py-2.5' : ''}" data-about-to-fill={summaryToFill || undefined}>
					{#if summaryToFill}<span class="font-evo-mono text-[0.625rem] leading-[1.3] font-bold tracking-[0.08em] text-orange-ink uppercase">Start here</span>{/if}
					<!-- In the Edit mode the whole summary is a field, held until Save, its count under it (criteria 41514698, 72251131); out of it, the same text whole (criterion 416e4885). -->
					<StagedText
						anchor="product"
						read={productRead}
						field="text"
						multiline
						label="Product summary"
						max={LIMITS.brief}
						{editable}
						placeholder="Say in a few lines what the product is, for whom, and why it matters"
						class="m-0 max-w-[86ch] text-[0.9375rem] leading-[1.6] text-ink-2"
					>
						{#each summaryShown as paragraph, i (i)}
							<p class="m-0 max-w-[86ch] text-[0.9375rem] leading-[1.6] text-ink-2">
								<GlossaryText text={paragraph} />
								<!-- Its comments and sources close the summary as a citation closes a sentence, its cross and its check right after them, small (criteria 416e4885, a4ef7658). -->
								{#if i === summaryShown.length - 1 && !mode.active}<CiteLinks anchor="product" />{#if g.pitch}<SpecControls anchor="product" title="Product summary" values={product} inline cites trailing />{/if}{/if}
							</p>
						{/each}
					</StagedText>
					{#if meta.length}
						<!-- In the Edit mode each group names what it fills in the product's profile; out of it a chip names it in its tooltip (criterion 3bb5b091). -->
						<div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5" data-chips>
							{#each meta as group (group.dimension)}
								<span class="flex flex-wrap items-center gap-1.5 {mode.active ? 'mr-2.5' : ''}">
									{#if mode.active}<span class="font-evo-mono text-[0.625rem] leading-[1.3] tracking-[0.08em] text-ink-3 uppercase" data-dimension>{group.dimension}</span>{/if}
									{#each group.labels as label (label)}
										<span class={FACT} title="{group.dimension}: {label}">{label}</span>
									{/each}
								</span>
							{/each}
						</div>
					{/if}
				</div>
				{#if g.pitch && mode.active}
					<!-- In the Edit mode, where the summary is a field, its controls take a line of their own under the chips, at its start (criterion 416e4885). -->
					<div class="flex empty:hidden"><SpecControls anchor="product" title="Product summary" values={product} inline cites trailing /></div>
				{/if}
				<!-- What it rests on and its thread (a question asked to the AI) at its foot, under everything it shows. -->
				<BlockFoot anchor="product" title="Product summary" />
			</div>
		{/if}
		<div class="mt-3.5 grid grid-cols-4 gap-x-7 gap-y-3 max-[1180px]:grid-cols-2 max-[560px]:grid-cols-1" role="group" aria-label="The product in figures">
			{#each figures as figure (figure.key)}<FigureTile {figure} />{/each}
		</div>
	</PageHead>

	{#if editingProduct}
		<!-- Its editor across the page, under the head (criterion 416e4885). -->
		<div id={anchorDomId('product')} data-evo-waits={validation.waitsOnMe('product') || undefined} class="mb-6 flex scroll-mt-36 flex-col gap-2">
			<InlineEditor anchor="product" />
			<BlockFoot anchor="product" title="Product summary" />
		</div>
	{/if}

	<!-- Its validation reads in the band at the top of Knowledge, in view while the page scrolls (criterion f480783f). -->
	<FeatureValidation anchors={pageAnchors} sectionId="kb-glance" kicker="Validation of this page" />

	<div class="flex flex-col gap-6">
		{#if hasWhy}
			<SectionBox id="kb-why" title="Why it exists" intro="The gap the product closes, in one picture.">
				<!-- The frame is where its cards are validated on the Overview, so Validate all shows at rest (criterion 416e4885). -->
				{#snippet actions()}<SectionValidateAll anchors={why} what="elements" sectionId="kb-why" always />{@render frameComments(FRAME.why, 'Why it exists')}{/snippet}
				<ProblemTarget problem={hasProblem ? problem : null} target={hasTarget ? target : null} outcomes={g.outcomes} {editable} />
				{@render frameFoot(FRAME.why, 'Why it exists')}
			</SectionBox>
		{/if}

		{#if cores.length > 0 || editable}
			<!-- Its number of areas opens the Features page, where every feature reads inside its area (criterion 416e4885). -->
			{#snippet whatIntro()}<a href="{base}/features" class="font-semibold text-blue-ink underline decoration-[1.5px] underline-offset-[3px] hover:decoration-[3px]">{plural(cores.length, 'area')}</a>, {plural(features, 'feature')}.{/snippet}
			<SectionBox id="kb-what" title="What it does" intro={whatIntro}>
				{#snippet actions()}
					<SectionValidateAll anchors={coreAnchors} what="core features" sectionId="kb-what" always />
					{@render frameComments(FRAME.what, 'What it does')}
				{/snippet}
				<CoreList {cores} {editable} hrefOf={coreHref} />
				{@render frameFoot(FRAME.what, 'What it does')}
			</SectionBox>
		{/if}

		<div class="grid items-start gap-6 max-[1100px]:grid-cols-1 {users.length > 0 ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : 'grid-cols-1'}">
			{#if users.length > 0}
				<SectionBox id="kb-who" title="Who uses it" intro="{plural(users.length, 'profile')}, each with the number of actions it can perform.">
					<!-- The frame offers fresh profile approvals; reviewed lines keep their own withdrawal (criterion f2eabcd9). -->
					{#snippet actions()}<SectionValidateAll anchors={userAnchors} what="profiles" sectionId="kb-who" always />{@render frameComments(FRAME.who, 'Who uses it')}{/snippet}
					<UserList {users} reach={data.reach} hrefOf={userHref} />
					{@render frameFoot(FRAME.who, 'Who uses it')}
				</SectionBox>
			{/if}
			<!-- The summary of every point the project health is computed from; the list is its own page (criterion 55a7fe86). -->
			<SectionBox id="kb-noticed" title="What Lyriks noticed" intro={noticedIntro}>
				{#snippet actions()}{@render frameComments(FRAME.noticed, 'What Lyriks noticed')}{/snippet}
				{#if data.noticed.total > 0}
					<NoticedSummary summary={data.noticed} href="{base}/noticed" />
				{:else if g.healthReading}
					<!-- The project's first reading is taken behind; its points land here in place (ac-score-shown-at-once). -->
					<div class="{LIST} bg-toner" role="status"><p class="{META} m-0 px-4 py-4">The points land here once the reading is taken.</p></div>
				{/if}
				{@render frameFoot(FRAME.noticed, 'What Lyriks noticed')}
			</SectionBox>
		</div>
	</div>
</div>
