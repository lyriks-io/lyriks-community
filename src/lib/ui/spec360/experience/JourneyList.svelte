<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { JourneyRow } from '$application/spec360/experience';
	import { leadSentence } from '$application/spec360/labels';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import BlockFoot from '../BlockFoot.svelte';
	import CiteLinks from '../CiteLinks.svelte';
	import InlineEditor from '../InlineEditor.svelte';
	import SpecControls from '../SpecControls.svelte';
	import { useDiscussions } from '../discussions.svelte';
	import { useEdits } from '../edits.svelte';
	import { useValidation } from '../validation.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import StagedText from '../StagedText.svelte';
	import BarList from '../page/BarList.svelte';
	import BarRow from '../page/BarRow.svelte';

	/**
	 * The key journeys (criterion 1fbdddaa): one row per journey, its blue bar
	 * as long as its steps against the longest; a click unfolds its steps in
	 * order, numbered, joined by arrows and closed by END. Each row keeps its
	 * discussion, its sources, its edit in place and its validation; opening
	 * its editor or a link to it unfolds it.
	 */
	let { journeys }: { journeys: readonly JourneyRow[] } = $props();
	const validation = useValidation();
	const edits = useEdits();
	// In the Edit mode every journey unfolds on its name and description as fields (criterion 41514698).
	const mode = useEditMode();
	const discussions = useDiscussions();

	let open = $state<ReadonlySet<string>>(new Set(discussions.openAnchor?.startsWith('journey:') ? [discussions.openAnchor.slice('journey:'.length)] : []));
	const toggle = (id: string) => {
		const next = new Set(open);
		if (!next.delete(id)) next.add(id);
		open = next;
	};
	// The row reads the journey's opening; the whole description, with its glossary words marked, unfolds with the steps.
	const opening = (text: string) => {
		const first = leadSentence(text);
		return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
	};
	// A link to a journey's discussion, or the reader landing on it to validate it, shows its steps.
	$effect(() => {
		const anchor = discussions.openAnchor;
		if (!anchor?.startsWith('journey:')) return;
		untrack(() => {
			const id = anchor.slice('journey:'.length);
			if (!open.has(id)) open = new Set([...open, id]);
		});
	});
	$effect(() => {
		const hash = page.url.hash.slice(1);
		untrack(() => {
			const hit = journeys.find((j) => anchorDomId(anchorOf('journey', j.id)) === hash);
			if (hit && !open.has(hit.id)) open = new Set([...open, hit.id]);
		});
	});
</script>

<BarList label="Key journeys">
	{#each journeys as j (j.id)}
		{@const anchor = anchorOf('journey', j.id)}
		{@const read = { text: j.name, desc: j.description }}
		{@const e = edits.shown(anchor, read)}
		{@const unfolded = open.has(j.id) || edits.editing === anchor || mode.active}
		<div role="listitem" id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="scroll-mt-36 border-t border-evo-line-soft first:border-t-0">
			{#snippet preview()}<GlossaryText text={e.desc ? opening(e.desc) : ''} /><CiteLinks {anchor} />{/snippet}
			<BarRow listitem={false} disabled={mode.active} title={e.text} description={unfolded ? undefined : preview} onclick={() => toggle(j.id)} expanded={unfolded} value={j.steps.length} unit="step">
				{#snippet controls()}<SpecControls {anchor} title="Journey · {e.text}" values={e} inline cites />{/snippet}
			</BarRow>
			{#if unfolded}
				<div class="flex animate-lk-in-fast flex-col gap-3 px-[18px] pt-1 pb-[18px]">
					<InlineEditor {anchor} />
					{#if mode.active}
						<div class="flex flex-col gap-1.5">
							<StagedText {anchor} {read} field="text" label="Name" class="text-[0.9375rem] font-bold text-ink" />
							<StagedText {anchor} {read} field="desc" multiline label="Description" class="text-sm leading-[1.55] text-evo-ink-2" />
						</div>
					{:else if edits.editing !== anchor}
						<p class="m-0 text-sm leading-[1.55] text-evo-ink-2"><GlossaryText text={e.desc} /><CiteLinks {anchor} /></p>
					{/if}
					{#if j.steps.length}
						<ol class="m-0 flex list-none flex-wrap items-center gap-y-2 p-0" aria-label="Steps of {e.text}">
							{#each j.steps as step, i (i)}
								<li class="inline-flex items-center">
									<span class="inline-flex items-center gap-1.5 border-[1.5px] border-ink bg-paper px-2.5 py-1 text-[0.8125rem] leading-snug font-medium text-ink">
										<span class="font-evo-mono text-[0.6875rem] font-bold text-blue-ink">{i + 1}</span><GlossaryText text={step} />
									</span>
									<span aria-hidden="true" class="px-1.5 font-evo-mono text-ink-3">→</span>
								</li>
							{/each}
							<li><span class="bg-evo-ink px-2 py-[3px] font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-paper">END</span></li>
						</ol>
					{:else}
						<p class="m-0 text-sm text-evo-muted">No step of this journey is described yet.</p>
					{/if}
				</div>
			{/if}
			<div class="px-[18px] has-[*]:pb-3.5"><BlockFoot {anchor} title="Journey · {e.text}" /></div>
		</div>
	{/each}
</BarList>
