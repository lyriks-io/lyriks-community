<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import { coreValidation } from '$application/spec360/core-validation';
	import { addedLast } from '$application/spec360/edits';
	import type { CoreSummary } from '$application/spec360/features';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import SpecControls from '../SpecControls.svelte';
	import BlockFoot from '../BlockFoot.svelte';
	import FeatureValidation from '../FeatureValidation.svelte';
	import InlineEditor from '../InlineEditor.svelte';
	import NewBadge from '../NewBadge.svelte';
	import HeadText from '../page/HeadText.svelte';
	import StagedText from '../StagedText.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import { useEdits } from '../edits.svelte';
	import AskAiTool from '../page/AskAiTool.svelte';
	import OpenRow from '../page/OpenRow.svelte';
	import AddButton from '../page/AddButton.svelte';
	import PageHead from '../page/PageHead.svelte';
	import SectionBox from '../page/SectionBox.svelte';
	import { useSpecNews } from '../spec-news.svelte';
	import { useValidation } from '../validation.svelte';

	/**
	 * A core feature's page (criterion 64fa19d5), after the design: its head
	 * (CORE FEATURE, its name, Edit, its comments, Ask my AI, its description,
	 * the chips counting its features and their actions), the validation of
	 * all it holds while the spec is a draft, then Features, one row per
	 * feature from A to Z with its New or Changed badge (criteria 2a6bff42,
	 * b0950115) and the number of its actions named (criterion 41a9c9d6),
	 * and its own validation beside its link (criteria 74f14936, 89d4c960). In the Edit mode its
	 * name and description, and each feature's, are fields held until Save
	 * (criterion 41514698).
	 */
	let { core, base }: { core: CoreSummary; base: string } = $props();
	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	const news = useSpecNews();
	const anchor = $derived(anchorOf('core', core.id));
	const headRead = $derived({ text: core.name, desc: core.description });
	const head = $derived(edits.shown(anchor, headRead));
	const scope = $derived(coreValidation(validation.source.elements.map((e) => e.id), core.id, core.features.map((f) => f.id)));
	const actions = $derived(core.features.reduce((n, f) => n + f.actionCount, 0));
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite && !!edits.shape(anchor));
	// A feature added here shows at the foot of the list until its name is written, then takes its alphabetical place (criterion 042ee8c0).
	const features = $derived(
		addedLast(
			[
				...core.features,
				...edits
					.added('feature', core.features.map((f) => f.id))
					.filter((a) => a.coreId === core.id)
					.map((a) => ({ id: a.id, name: a.name, description: '', actionCount: 0 }))
			],
			(f) => edits.naming(anchorOf('feature', f.id))
		)
	);
	const counted = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
	const CHIP = 'inline-flex h-[22px] items-center border border-line bg-toner px-[7px] font-evo-mono text-[0.6875rem] text-ink-2';
</script>

<div id="kb-core-{core.id}" class="flex animate-lk-in flex-col">
	<!-- Its name and description are fields of the Edit mode, held until Save (criterion 41514698). -->
	{#snippet name()}<StagedText {anchor} read={headRead} field="text" label="Name" {editable}>{head.text}</StagedText>{/snippet}
	<PageHead kicker="Core feature" title={head.text} {name}>
		{#snippet tools()}
			<AskAiTool {anchor} title={head.text} />
		{/snippet}
		<div id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="flex scroll-mt-44 flex-col gap-2">
			{#if edits.editing === anchor}
				<InlineEditor {anchor} />
			{:else}
				<!-- Its comments and sources close its text, its cross and its check right after them (criterion 14a1164c). -->
				<HeadText {anchor} title={head.text} values={head}>
					{#snippet text()}<StagedText {anchor} read={headRead} field="desc" multiline label="Description" {editable}>
							{#if head.desc}<GlossaryText text={head.desc} />{:else}<span class="text-ink-3">The specification does not say what this core feature covers yet.</span>{/if}
						</StagedText>{/snippet}
				</HeadText>
			{/if}
			<div class="flex flex-wrap items-center gap-1.5">
				<span class={CHIP}>{counted(features.length, 'feature')}</span>
				<span class={CHIP}>{counted(actions, 'action')}</span>
			</div>
			<div class="empty:hidden"><BlockFoot {anchor} title={head.text} /></div>
		</div>
	</PageHead>

	<div class="flex flex-col gap-6">
		{#if scope.anchors.length}
			<div class="empty:hidden">
				<FeatureValidation anchors={scope.anchors} sectionId="kb-core-{core.id}" kicker="Validation of this core feature" />
			</div>
		{/if}
		<SectionBox title="Features" intro={features.length ? 'Open a feature to read its journey, its rules and its data.' : undefined}>
			{#if features.length}
				<ul class="m-0 grid list-none gap-2 p-0" aria-label="Features of {head.text}">
					{#each features as f (f.id)}
						{@const mark = news?.badgeOf(f.id)}
						{@const rowAnchor = anchorOf('feature', f.id)}
						<!-- Each row stacks its name and description with local discussion/evidence links; Edit keeps both fields (criteria 81cd5cfd, 41514698). -->
						<li id={anchorDomId(rowAnchor)} data-evo-waits={validation.waitsOnMe(rowAnchor) || undefined} class="scroll-mt-44">
							<OpenRow anchor={rowAnchor} name={f.name} description={f.description} href="{base}/features/{encodeURIComponent(f.id)}" count={f.actionCount} unit="action">
								{#snippet badge()}{#if mark}<NewBadge news={mark} />{/if}{/snippet}
								<!-- The same acts as a term of the Glossary or an action (criterion 74f14936); its comments and sources close its text. -->
								{#snippet controls()}<SpecControls anchor={rowAnchor} title={f.name} inline cites trailing />{/snippet}
							</OpenRow>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="m-0 text-sm text-ink-3"><b class="text-ink">No feature yet.</b> This core feature holds no feature.</p>
			{/if}
			{#if editable}
				<AddButton label="Add a feature" onclick={() => void edits.add('feature', core.id)} />
			{/if}
		</SectionBox>
	</div>
</div>
