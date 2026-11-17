<script lang="ts">
	import { untrack } from 'svelte';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { shadowSamples, typeIntro } from '$application/spec360/experience';
	import { ExperienceStore } from '$ui/experience/draft-store.svelte';
	import { toastNotifier } from '$ui/composition/client-container';
	import CardGrid from '$ui/spec360/CardGrid.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import { useDiscussions } from '$ui/spec360/discussions.svelte';
	import ComponentPreview from '$ui/spec360/ComponentPreview.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { CARD, FACT, LABEL, TAG_BETA } from '$ui/spec360/page/look';
	import { BETA_TIP } from '$ui/spec360/knowledge-bar';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import { addedLast } from '$application/spec360/edits';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import ColorSwatches from '$ui/spec360/experience/ColorSwatches.svelte';
	import JourneyList from '$ui/spec360/experience/JourneyList.svelte';
	import ShapesAndSpacing from '$ui/spec360/experience/ShapesAndSpacing.svelte';
	import TypeSpecimen from '$ui/spec360/experience/TypeSpecimen.svelte';
	import type { PageData } from './$types';

	/**
	 * Experience: the style in a sentence, the key journeys that unfold into
	 * their steps (criterion 1fbdddaa), then the visual identity the screens
	 * are drawn with, each value drawn at its size (ac-brand-palette-roles,
	 * ac-brand-design-system-read), and the reusable components as they render.
	 * The visual identity is one block: validated, discussed and cited from the
	 * head of Colors, its discussion at the foot of its last group. The head
	 * carries the page's tools (criterion 14a1164c) and its facts as chips;
	 * each section is a box, and in the Edit mode a click on a component's
	 * text opens its editor (criterion 41514698).
	 */
	let { data }: { data: PageData } = $props();
	const v = $derived(data.view);
	const ds = $derived(v.designSystem);

	// Read-only here: the store only renders the component trees; nothing on
	// this page touches it, so it never saves.
	const store = untrack(() => new ExperienceStore(data.draft, data.session, toastNotifier, data.revision));
	$effect(() => store.hydrate(data.draft, data.revision));

	const validation = useValidation();
	const edits = useEdits();
	const discussions = useDiscussions();
	const mode = useEditMode();
	const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
	const editable = $derived(validation.draft && validation.source.canWrite && mode.active);
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	// What the experience holds, each named; what it holds none of is left out.
	const facts = $derived(
		(
			[
				[v.journeys.length, 'journey', 'journeys'],
				[v.colors.length, 'colour', 'colours'],
				[v.components.length, 'component', 'components']
			] as const
		)
			.filter(([n]) => v.authored && n > 0)
			.map(([n, one, many]) => `${n} ${plural(n, one, many)}`)
	);
	const waits = (anchor: string) => validation.waitsOnMe(anchor) || undefined;
	// A journey or a component added here shows at the foot until it is named (criterion 51e215ef).
	const journeys = $derived(
		addedLast(
			[...v.journeys, ...edits.added('journey', v.journeys.map((j) => j.id)).map((a) => ({ id: a.id, name: a.name, description: '', steps: [] as string[] }))],
			(j) => edits.naming(anchorOf('journey', j.id))
		)
	);
	const components = $derived(
		addedLast(
			[...v.components, ...edits.added('component', v.components.map((c) => c.id)).map((a) => ({ id: a.id, name: a.name, description: '', usedOn: [] as string[], usage: '', designed: false }))],
			(c) => edits.naming(anchorOf('component', c.id))
		)
	);

	const journeysIntro = $derived(
		v.journeys.length === 1 ? 'The main path through the app. Open it to see its steps in order.' : `The ${v.journeys.length} main paths through the app. Open one to see its steps in order.`
	);
	const shapesIntro = $derived(
		ds.corners.length && ds.spacing.length
			? 'The corner radii and the spacing steps of the screens, drawn to scale.'
			: ds.corners.length
				? 'The corner radii of the screens, drawn to scale.'
				: 'The spacing steps of the screens, drawn to scale.'
	);
	// Each shadow under what it lifts: a button shadow under the brand's button.
	const shadows = $derived(shadowSamples(ds.shadows, v.palette, ds.corners));
	const liftIntro = $derived(
		ds.shadows.length && ds.breakpoints.length
			? 'How surfaces lift off the page, and the widths where the layout changes.'
			: ds.shadows.length
				? 'How surfaces lift off the page.'
				: 'The widths where the layout changes.'
	);
</script>

{#snippet tools()}
	<AskAiTool anchor="branding" title="Branding" subject="the experience of {data.spec.productName}" />
{/snippet}

<section aria-label="Experience" class="flex animate-lk-in flex-col">
	<PageHead title="Experience" lead={v.lead || undefined} {tools} cite={{ anchor: 'branding', title: 'Branding' }}>
		{#snippet mark()}<span class={TAG_BETA} title={BETA_TIP}>Beta</span>{/snippet}
		{#snippet meta()}
			{#each facts as fact (fact)}<span class={FACT}>{fact}</span>{/each}
		{/snippet}
	</PageHead>

	{#if !v.authored}
		<p class="m-0 text-[0.9375rem] text-evo-muted">The experience is not described in the spec yet.</p>
	{:else}
		<div class="flex flex-col gap-6">
			{#if journeys.length || editable}
				<SectionBox id="kb-journeys" title="Key journeys" intro={journeysIntro}>
					{#snippet actions()}<SectionValidateAll anchors={v.journeys.map((j) => anchorOf('journey', j.id))} what="journeys" sectionId="kb-journeys" />{/snippet}
					<JourneyList {journeys} />
					{#if editable}<AddButton label="Add a journey" onclick={() => void edits.add('journey')} />{/if}
				</SectionBox>
			{/if}

			<!-- The visual identity, one block of the spec from Colors to its last group. -->
			<div id={anchorDomId('branding')} data-evo-waits={waits('branding')} class="flex scroll-mt-36 flex-col gap-6">
				<SectionBox title="Colors" intro={v.colorsIntro}>
					{#snippet actions()}<SpecControls anchor="branding" title="Branding" />{/snippet}
					{#if v.colors.length}<ColorSwatches slots={v.colors} />{/if}
				</SectionBox>

				{#if ds.family || ds.sizes.length}
					<SectionBox title="Typography" intro={typeIntro(ds)}>
						{#if ds.sizes.length}<TypeSpecimen {ds} />{/if}
					</SectionBox>
				{/if}

				{#if ds.corners.length || ds.spacing.length}
					<SectionBox title="Corners and spacing" intro={shapesIntro}>
						<ShapesAndSpacing corners={ds.corners} spacing={ds.spacing} />
					</SectionBox>
				{/if}

				{#if ds.shadows.length || ds.breakpoints.length}
					<SectionBox title="Shadows and breakpoints" intro={liftIntro}>
						<div class="{CARD} flex flex-col gap-5">
							{#if ds.shadows.length}
								<div class="flex flex-wrap gap-5">
									{#each shadows as t (t.name)}
										<span class="flex w-[150px] flex-col gap-1.5 text-[0.8125rem]" title={t.value}>
											{#if t.button}
												<span class="mb-1 flex h-12 items-center">
													<i
														aria-hidden="true"
														class="inline-flex h-10 items-center px-5 text-sm font-semibold not-italic {t.button.ink === 'white' ? 'text-white' : 'text-evo-ink'}"
														style:background={t.button.fill}
														style:border-radius="{t.button.radiusPx ?? 8}px"
														style:box-shadow={t.shadow}
														style:font-family={ds.familyCss || undefined}>Button</i
													>
												</span>
											{:else}
												<i aria-hidden="true" class="mb-1 block h-12 w-full rounded-lg border border-evo-line-soft bg-white" style:box-shadow={t.shadow}></i>
											{/if}
											<b>{t.name}</b>
											{#if t.usage}<span class="text-xs text-evo-muted">{t.usage}</span>{/if}
										</span>
									{/each}
								</div>
							{/if}
							{#if ds.breakpoints.length}
								<div class="flex flex-col gap-1.5">
									<span class="{LABEL} text-evo-muted">Breakpoints</span>
									{#each ds.breakpoints as t (t.name)}
										<span class="text-sm text-evo-ink-3"><b class="text-evo-ink">{t.name}</b> <span class="font-evo-mono text-xs text-evo-muted">≤ {t.value}</span>{t.usage ? ` · ${t.usage}` : ''}</span>
									{/each}
								</div>
							{/if}
						</div>
					</SectionBox>
				{/if}
				<!-- Its discussion and its sources at its foot, under everything it shows. -->
				<div class="empty:hidden"><BlockFoot anchor="branding" title="Branding" /></div>
			</div>

			{#if components.length || editable}
				<SectionBox id="kb-components" title="Components" intro="The {v.components.length} reusable {plural(v.components.length, 'component', 'components')} the screens are built from, each drawn as it renders.">
					{#snippet actions()}<SectionValidateAll anchors={v.components.map((c) => anchorOf('component', c.id))} what="components" sectionId="kb-components" />{/snippet}
					<CardGrid class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
						{#snippet children(motion)}
							{#each components as c, i (c.id)}
								{@const anchor = anchorOf('component', c.id)}
								{@const e = edits.shown(anchor, { text: c.name, desc: c.description })}
								<div
									id={anchorDomId(anchor)}
									data-evo-waits={waits(anchor)}
									class="flex scroll-mt-36 flex-col gap-2.5 rounded-xl border border-evo-line bg-surface p-4 transition-colors duration-150 hover:border-ink"
									style={motion.lock(i, discussions.openAnchor === anchor || edits.editing === anchor)}
								>
									{#if c.designed}<ComponentPreview {store} componentId={c.id} />{/if}
									{#if edits.editing === anchor}
										<InlineEditor {anchor} />
									{:else}
										<!-- Its name and description are fields of the Edit mode, held until Save (criterion 41514698). -->
										<span class="flex min-w-0 flex-col gap-1">
											<b class="text-base leading-[1.35]"><StagedText {anchor} read={{ text: c.name, desc: c.description }} field="text" label="Name" {editable}>{e.text}</StagedText></b>
											<span class="text-sm text-evo-ink-2"><StagedText {anchor} read={{ text: c.name, desc: c.description }} field="desc" multiline label="Description" {editable}><span class="line-clamp-3">{c.usage || e.desc}</span></StagedText></span>
										</span>
									{/if}
									<span class="mt-auto flex border-t border-evo-line-soft pt-2"><SpecControls {anchor} title={e.text} values={e} discuss="card" inline /></span>
									<BlockFoot {anchor} title={e.text} />
								</div>
							{/each}
						{/snippet}
					</CardGrid>
					{#if editable}<AddButton label="Add a component" onclick={() => void edits.add('component')} />{/if}
				</SectionBox>
			{/if}
		</div>
	{/if}
</section>
