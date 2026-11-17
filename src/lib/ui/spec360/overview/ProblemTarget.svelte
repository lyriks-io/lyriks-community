<script lang="ts">
	import { anchorDomId } from '$domain/discussions';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import type { GlanceOutcome } from '$application/spec360/glance';
	import BlockFoot from '../BlockFoot.svelte';
	import InlineEditor from '../InlineEditor.svelte';
	import SpecControls from '../SpecControls.svelte';
	import StagedText from '../StagedText.svelte';
	import StagedTags from '../StagedTags.svelte';
	import { useEdits } from '../edits.svelte';
	import { useValidation } from '../validation.svelte';
	import { useDiscussions } from '../discussions.svelte';
	import { KICKER } from '../type-scale';
	import { resultsOf } from './results';

	/**
	 * Why the product exists, as one picture (criterion 416e4885): the problem
	 * on a red tint (its title THE PROBLEM, criterion 71338aeb, its text, then
	 * its SYMPTOMS), the target on a green one (THE TARGET, its text, then its
	 * RESULTS, each with its values when the spec gives
	 * them), one arrow from the first to the second and nothing else between
	 * them, the two as tall as each other. Why it exists offers fresh approval
	 * and discussion as a whole; a card keeps its confirmed personal check for
	 * withdrawal (criterion f2eabcd9). What a card still carries (its sources, a hand edit's
	 * mark, the speech mark of a discussion it held before) sits in its bottom
	 * right corner. In the Edit mode its text and its list are fields
	 * (criterion 41514698). On a narrow screen they stack and the arrow turns
	 * downwards.
	 */
	interface Props {
		problem: { readonly text: string; readonly tags?: readonly string[] } | null;
		target: { readonly text: string; readonly tags?: readonly string[] } | null;
		/** The target's results as the spec reads them, with their values. */
		outcomes: readonly GlanceOutcome[];
		/** The page's Edit mode is on and the reader may edit: the texts and the lists are fields. */
		editable: boolean;
	}
	let { problem, target, outcomes, editable }: Props = $props();
	const edits = useEdits();
	const validation = useValidation();
	const discussions = useDiscussions();
	// A card is discussed in its frame; a thread it already holds keeps its speech mark, so it stays in reach.
	const heldThread = (anchor: string) => discussions.tally(anchor).total > 0;
	const both = $derived(!!problem && !!target);
	// The results the card reads: the names shown (a saved edit at once), each with the values the spec gives it.
	const results = $derived(resultsOf(target?.tags ?? outcomes.map((o) => o.label), outcomes));
	const CARD = 'flex h-full min-w-0 scroll-mt-36 flex-col gap-3.5 border border-line px-6 pt-[22px] pb-4 max-[760px]:px-4';
	const TEXT = 'm-0 text-base leading-normal text-ink';
	const ITEM = 'flex min-h-[38px] items-center gap-2.5 bg-paper/70 px-3 py-2 text-[0.84375rem] font-medium';
	const LABEL = `${KICKER} text-[0.6875rem] text-ink-3`;
	const EMPTY = 'm-0 text-[0.8125rem] text-ink-3 italic';
	// Each card opens on what it is, in the ink of its tint (criterion 71338aeb).
	const TITLE = `${KICKER} font-bold`;
</script>

{#snippet marks(anchor: string, title: string, values: { readonly text: string; readonly tags?: readonly string[] })}
	<!-- In the card's bottom right corner, under its text, never floating in its middle (owner 2026-11-05). -->
	<div class="mt-auto flex flex-wrap justify-end empty:hidden" data-card-marks>
		<!-- The standard review control, the feature page's (criterion e20318e7). -->
		<SpecControls {anchor} {title} {values} discussed={heldThread(anchor)} inline />
	</div>
{/snippet}

<div class="grid items-stretch {both ? 'grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] max-[1180px]:grid-cols-1' : 'grid-cols-1'}">
	{#if problem}
		<article id={anchorDomId('problem')} data-evo-waits={validation.waitsOnMe('problem') || undefined} aria-label="The problem" class="{CARD} bg-red-tint">
			<h3 class="{TITLE} m-0 text-red-ink">The problem</h3>
			{#if edits.editing === 'problem'}
				<InlineEditor anchor="problem" />
			{:else}
				<StagedText anchor="problem" read={problem} field="text" multiline label="Problem" {editable} class={TEXT}>
					{#if problem.text}<p class={TEXT}><GlossaryText text={problem.text} /></p>{/if}
				</StagedText>
				<div class="flex flex-col gap-1.5">
					<span class={LABEL}>Symptoms</span>
					<!-- Each symptom a field of the Edit mode with its ×, then + Add a symptom (criterion 41514698). -->
					<StagedTags anchor="problem" read={problem} noun="symptom" {editable} itemClass={ITEM}>
						{#if problem.tags?.length}
							<ul class="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Symptoms">
								{#each problem.tags as s, i (i)}
									<li class={ITEM}><span class="size-2 flex-none bg-red" aria-hidden="true"></span><GlossaryText text={s} /></li>
								{/each}
							</ul>
						{:else if validation.draft}
							<p class={EMPTY}>No symptom written yet.</p>
						{/if}
					</StagedTags>
				</div>
			{/if}
			{@render marks('problem', 'Problems', problem)}
			<BlockFoot anchor="problem" title="Problems" />
		</article>
	{/if}
	{#if both}
		<span class="flex items-center justify-center text-ink-3 max-[1180px]:h-11" aria-hidden="true">
			<svg class="max-[1180px]:rotate-90" width="30" height="12" viewBox="0 0 30 12" fill="currentColor"><rect x="0" y="5" width="23" height="2"></rect><path d="M22 0.5 30 6 22 11.5z"></path></svg>
		</span>
	{/if}
	{#if target}
		<article id={anchorDomId('target')} data-evo-waits={validation.waitsOnMe('target') || undefined} aria-label="The target" class="{CARD} bg-green-tint">
			<h3 class="{TITLE} m-0 text-green-ink">The target</h3>
			{#if edits.editing === 'target'}
				<InlineEditor anchor="target" />
			{:else}
				<StagedText anchor="target" read={target} field="text" multiline label="Target" {editable} class={TEXT}>
					{#if target.text}<p class={TEXT}><GlossaryText text={target.text} /></p>{/if}
				</StagedText>
				<div class="flex flex-col gap-1.5">
					<span class={LABEL}>Results</span>
					<!-- Each result a field of the Edit mode with its ×, then + Add a result; a result is a KPI, named. -->
					<StagedTags anchor="target" read={target} noun="result" {editable} itemClass={ITEM}>
						{#if results.length}
							<ul class="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Results">
								{#each results as o, i (i)}
									<li class="{ITEM} flex-wrap">
										<span class="size-2 flex-none bg-green" aria-hidden="true"></span>
										<span class="flex-[1_1_160px]"><GlossaryText text={o.label} /></span>
										{#if o.to}<span class="text-[0.8125rem]">{#if o.from}<span class="text-red-ink line-through">{o.from}</span> →{/if} <b class="text-green-ink">{o.to}</b></span>{/if}
									</li>
								{/each}
							</ul>
						{:else if validation.draft}
							<p class={EMPTY}>No result written yet.</p>
						{/if}
					</StagedTags>
				</div>
			{/if}
			{@render marks('target', 'Objectives', target)}
			<BlockFoot anchor="target" title="Objectives" />
		</article>
	{/if}
</div>
