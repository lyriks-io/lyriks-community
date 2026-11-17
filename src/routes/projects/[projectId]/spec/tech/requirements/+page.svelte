<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { RequirementGroup } from '$application/spec360/tech';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SectionValidateAll from '$ui/spec360/SectionValidateAll.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { addedLast } from '$application/spec360/edits';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import SectionHead from '$ui/spec360/page/SectionHead.svelte';
	import { CARD, CHIP as LY_CHIP, KV_LABEL, KV_VALUE, LIST } from '$ui/spec360/page/look';
	import DeviceOutline from '$ui/spec360/tech/DeviceOutline.svelte';
	import type { PageData } from './$types';

	/**
	 * Tech and data · Requirements (criterion 4af7cac8): where the product must
	 * run, drawn; its languages, the primary one marked; its security, its
	 * compliance and its accessibility, one card per question with what the
	 * spec answers (a question left unanswered says so in red); then the
	 * technical constraints, each edited in place. Each group is discussed,
	 * cited and validated as one element.
	 */
	let { data }: { data: PageData } = $props();
	const validation = useValidation();
	const edits = useEdits();
	const waits = (anchor: string) => validation.waitsOnMe(anchor) || undefined;
	const mode = useEditMode();
	// Adding is a draft's, in its Edit mode, for whoever may write it (criterion 51e215ef).
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite);
	// A constraint added here shows at the foot until it is named (criterion 51e215ef).
	const constraints = $derived(
		addedLast(
			[...data.constraints, ...edits.added('constraint', data.constraints.map((c) => c.id)).map((a) => ({ id: a.id, title: a.name, detail: '' }))],
			(c) => edits.naming(anchorOf('constraint', c.id))
		)
	);

	const TITLE: Record<RequirementGroup['key'], string> = {
		runtime: 'Where it must run',
		languages: 'Languages',
		security: 'Security',
		compliance: 'Compliance',
		accessibility: 'Accessibility'
	};
	// The questions answered as cards, one per row of the group.
	const CARD_GROUPS = ['security', 'compliance', 'accessibility'] as const;
	const group = (key: RequirementGroup['key']) => data.groups.find((g) => g.key === key) ?? null;
	const anchors = $derived(data.groups.map((g) => anchorOf('requirements', g.key)));
	// A sentence written as an answer is read as one, never squeezed into a chip.
	const LONG = 40;
	const isLong = (v: string) => v.length > LONG;
	const runtime = $derived(data.runtime);
	const languages = $derived(data.languages.languages);
	const primary = $derived(languages.find((l) => l.primary)?.label ?? null);
	const languagesIntro = $derived(
		languages.length === 0
			? 'No language is declared yet.'
			: languages.length === 1
				? `One language: ${languages[0].label}.`
				: `${languages.length} languages${primary ? `; ${primary} is the primary one` : ''}.`
	);
	// The design's chip (.ly-chip); the primary one outlined in the product blue.
	const CHIP = `inline-flex items-center ${LY_CHIP} px-3 py-1`;
	const MAIN = 'border-blue! font-semibold text-blue-ink!';
	const NONE = 'text-[0.9375rem] font-semibold text-evo-red';
</script>

{#snippet answers(values: readonly string[])}
	{#if values.length === 0}
		<p class="m-0 mt-2 {NONE}">None declared</p>
	{:else if values.some(isLong)}
		{#each values as v (v)}<p class="m-0 mt-2 text-[0.9375rem] leading-[1.5] text-evo-ink-2">{v}</p>{/each}
	{:else}
		<p class="m-0 mt-2 {KV_VALUE}">{values.join(', ')}</p>
	{/if}
{/snippet}

{#snippet head(key: RequirementGroup['key'], intro: string | undefined, first: boolean)}
	<SectionHead title={TITLE[key]} {intro} {first}>
		{#snippet actions()}
			{#if first}<SectionValidateAll {anchors} what="requirements" sectionId="kb-requirements" />{/if}
			<SpecControls anchor={anchorOf('requirements', key)} title={TITLE[key]} />
		{/snippet}
	</SectionHead>
{/snippet}

<section id="kb-requirements" aria-label="Requirements" class="group/section flex animate-lk-in flex-col">
	{#if group('runtime')}
		{@const anchor = anchorOf('requirements', 'runtime')}
		<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-36 flex-col gap-3">
			{@render head('runtime', undefined, true)}
			<div class="{CARD} -mt-1 flex flex-col gap-3">
				{#if runtime.devices.length || runtime.platforms.length || runtime.browsers.length}
					<div class="flex flex-wrap items-start gap-x-[18px] gap-y-3">
						<!-- The devices drawn first, then the form factors with no device, the platforms in violet, the browsers. -->
						{#each runtime.devices.filter((d) => d.shape) as d (d.code)}<DeviceOutline shape={d.shape!} label={d.label} />{/each}
						{#each runtime.devices.filter((d) => !d.shape) as d (d.code)}<span class="{CHIP} self-center">{d.label}</span>{/each}
						{#each runtime.platforms.filter((p) => !isLong(p)) as p (p)}<span class="{CHIP} {MAIN} self-center">{p}</span>{/each}
						{#each runtime.browsers.filter((b) => !isLong(b)) as b (b)}<span class="{CHIP} self-center">{b}</span>{/each}
					</div>
					{#each runtime.platforms.filter(isLong) as v (v)}
						<p class="m-0 text-[0.9375rem] leading-[1.5] text-evo-ink-2">{v}</p>
					{/each}
					{#each runtime.browsers.filter(isLong) as v (v)}
						<p class="m-0 text-[0.9375rem] leading-[1.5] text-evo-ink-2"><b class="font-semibold">Browsers.</b> {v}</p>
					{/each}
				{:else}
					<p class="m-0 {NONE}">None declared</p>
				{/if}
			</div>
			<BlockFoot {anchor} title={TITLE.runtime} />
		</div>
	{/if}

	{#if group('languages')}
		{@const anchor = anchorOf('requirements', 'languages')}
		<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-36 flex-col gap-3">
			{@render head('languages', languagesIntro, false)}
			{#if languages.length}
				<div class="-mt-1 flex flex-wrap gap-1.5">
					{#each languages as l (l.label)}
						<span class="{CHIP} {l.primary ? MAIN : ''}" title={l.primary ? 'The primary language' : undefined}>{l.label}</span>
					{/each}
				</div>
			{/if}
			{#if data.languages.formats.length}
				<dl class="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm max-[560px]:grid-cols-1">
					{#each data.languages.formats as f (f.label)}
						<dt class="font-semibold text-evo-ink-3">{f.label}</dt>
						<dd class="m-0 text-evo-ink-2 max-[560px]:mb-1.5">{f.values.join(', ')}</dd>
					{/each}
				</dl>
			{/if}
			<BlockFoot {anchor} title={TITLE.languages} />
		</div>
	{/if}

	{#each CARD_GROUPS as key (key)}
		{@const g = group(key)}
		{#if g}
			{@const anchor = anchorOf('requirements', key)}
			<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-36 flex-col gap-3">
				{@render head(key, undefined, false)}
				<div class="-mt-1 grid gap-3 {g.rows.length >= 3 ? 'grid-cols-3' : g.rows.length === 2 ? 'grid-cols-2' : 'grid-cols-1'} max-[700px]:grid-cols-1">
					{#each g.rows as row (row.label)}
						<div class={CARD}>
							<div class={KV_LABEL}>{row.label}</div>
							{@render answers(row.values)}
						</div>
					{/each}
				</div>
				<BlockFoot {anchor} title={TITLE[key]} />
			</div>
		{/if}
	{/each}

	{#if constraints.length || editable}
		<div id="kb-constraints" class="group/section flex flex-col">
			<SectionHead title="Technical constraints" intro="The non-negotiables of how the product is built.">
				{#snippet actions()}<SectionValidateAll anchors={data.constraints.map((c) => anchorOf('constraint', c.id))} what="constraints" sectionId="kb-constraints" />{/snippet}
			</SectionHead>
			<div class={LIST}>
				{#each constraints as c (c.id)}
					{@const anchor = anchorOf('constraint', c.id)}
					{@const read = { text: c.title, desc: c.detail }}
					{@const e = edits.shown(anchor, read)}
					<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-36 flex-col gap-2 border-t border-evo-line-soft px-[18px] py-4 first:border-t-0">
						<div class="flex flex-wrap items-start gap-3">
							<span class="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
								{#if edits.editing === anchor}
									<InlineEditor {anchor} />
								{:else}
									<!-- Its title and detail are fields of the Edit mode, held until Save (criterion 41514698). -->
									<h3 class="m-0 text-[1.0625rem] leading-[1.35] font-bold tracking-[-0.01em] text-evo-ink"><StagedText {anchor} {read} field="text" label="Title">{e.text}</StagedText></h3>
									<StagedText {anchor} {read} field="desc" multiline label="Detail" class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">
										{#if e.desc}<p class="m-0 text-[0.9375rem] leading-[1.55] text-evo-ink-2">{e.desc}</p>{/if}
									</StagedText>
								{/if}
							</span>
							<SpecControls {anchor} title={e.text} values={e} inline />
						</div>
						<BlockFoot {anchor} title={e.text} />
					</div>
				{/each}
			</div>
			{#if editable}<AddButton label="Add a constraint" onclick={() => void edits.add('constraint')} />{/if}
		</div>
	{/if}
</section>
