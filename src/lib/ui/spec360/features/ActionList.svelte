<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { actionRulesShown } from '$application/spec360/action-rule-disclosure';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { ActionData } from '$application/spec360/action-data';
	import type { FeatureActionView } from '$application/spec360/features';
	import { Icon } from '$ui/design-system';
	import RuleVerdictMark from '$ui/rules/RuleVerdictMark.svelte';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { getRuleVerdicts } from '$ui/rules/rule-verdicts.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import CiteLinks from '$ui/spec360/CiteLinks.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import { LINK } from '$ui/spec360/page/look';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { useDiscussions } from '$ui/spec360/discussions.svelte';
	import { useSources } from '$ui/spec360/sources.svelte';
	import ActionDetails from './ActionDetails.svelte';
	import ActionRules from './ActionRules.svelte';
	import { activateRow } from '$ui/shell/activate-row';

	/**
	 * A feature's actions as one list (criterion 50809f1c), in the order the
	 * behavior model declares them: each row its number, its name, what the
	 * solver says about it, Details, which unfolds what only it says, and its
	 * acts. Its rules stay folded until the reader opens them
	 * (criterion 54bd4e66). In the Edit mode a click on
	 * its name opens its editor in place (criterion 701caee5). The stored
	 * description and citations read beneath its name, once even with Details
	 * open (criterion b0c7f0c8); Details keeps actors and data.
	 */
	interface Props {
		featureId: string;
		actions: readonly FeatureActionView[];
		/** What each action reads and writes, by action id; none when the behavior model could not be read. */
		actionData: Readonly<Record<string, ActionData>>;
		/** An action read whole, picked from the journeys diagram (action 6f38e6ed): who, data and rules open, nothing to press. */
		whole?: boolean;
	}
	let { featureId, actions, actionData, whole = false }: Props = $props();
	const validation = useValidation();
	const discussions = useDiscussions();
	const sources = useSources();
	const ruleChoices = new SvelteMap<string, boolean>();
	const targetedRule = (action: FeatureActionView) => action.rules.some((rule) => {
		const anchor = anchorOf('rule', featureId, rule.id);
		return discussions?.openAnchor === anchor || sources?.openAnchor === anchor || page.url.hash === `#${anchorDomId(anchor)}`;
	});
	const edits = useEdits();
	const mode = useEditMode();
	const verdicts = getRuleVerdicts();
	// The actions whose Details the reader unfolded; the Edit mode holds them all open, what they are for being a field.
	const unfolded = new SvelteSet<string>();
	const toggle = (id: string) => void (unfolded.delete(id) || unfolded.add(id));
	const editable = (anchor: string) => mode.active && validation.draft && validation.source.canWrite && !!edits.shape(anchor);
	// No verdict is not a clean one: a feature the solver could not prove says so once, under its list (criterion be4c97ee).
	const unproven = $derived(verdicts?.unproven(featureId) ?? null);
</script>

<!-- Every row shares the list's columns, so Details stands in one column however wide the acts beside it are; a narrow screen wraps a row instead. -->
<ol class="m-0 grid list-none grid-cols-[26px_minmax(0,1fr)_auto_auto] gap-x-2.5 p-0 max-[700px]:flex max-[700px]:flex-col">
	{#each actions as action, i (action.id)}
		{@const anchor = anchorOf('action', featureId, action.id)}
		{@const read = { text: action.name, desc: action.description }}
		{@const shown = edits.shown(anchor, read)}
		{@const verdict = verdicts?.actionVerdict(featureId, action.id)}
		{@const open = whole || mode.active || unfolded.has(action.id)}
		{@const rulesShown = whole || actionRulesShown({ editing: mode.active, targeted: targetedRule(action), choice: ruleChoices.get(action.id) })}
		<li class="col-span-full grid grid-cols-subgrid gap-y-1 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 max-[700px]:flex max-[700px]:flex-col">
			<div use:activateRow={mode.active || whole} id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="col-span-full grid scroll-mt-44 grid-cols-subgrid gap-y-2 {mode.active || whole ? '' : 'cursor-pointer'} max-[700px]:flex max-[700px]:flex-col">
				{#if edits.editing === anchor}
					<div class="col-span-full"><InlineEditor {anchor} /></div>
				{:else}
					<div class="col-span-full grid grid-cols-subgrid items-start max-[700px]:flex max-[700px]:flex-wrap max-[700px]:gap-2.5">
						<span class="w-[26px] flex-none font-evo-mono text-xs text-ink-3 tabular-nums">{whole ? '' : i + 1}</span>
						<div class="flex min-w-0 flex-col gap-1 max-[700px]:flex-[1_1_220px]">
							<!-- Read whole from the diagram, its marked card is its title: the name is not repeated. -->
							<span class="flex min-w-0 items-center gap-2.5 {whole ? 'hidden' : ''}">
								<strong class="min-w-0 text-[0.9375rem] [overflow-wrap:anywhere]"
									><StagedText {anchor} {read} field="text" label="Name" editable={editable(anchor)}>{shown.text}</StagedText></strong
								>
								{#if verdict}<RuleVerdictMark {verdict} />{/if}
							</span>
							<p class="m-0 text-sm leading-normal whitespace-pre-line text-ink-2">
								<StagedText {anchor} {read} field="desc" multiline label="What it is for" editable={editable(anchor)}>
									{#if shown.desc}<GlossaryText text={shown.desc} />{:else}<span class="text-ink-3">The behavior model does not say what this action is for yet.</span>{/if}
								</StagedText>{#if !mode.active}<CiteLinks {anchor} />{/if}
							</p>
						</div>
					{#if whole}<span></span>{:else}<button type="button" data-row-open class="{LINK} justify-self-end disabled:cursor-default disabled:opacity-40 max-[700px]:ml-auto" aria-expanded={open} disabled={mode.active} onclick={() => toggle(action.id)}>
							Details<Icon name="chevron-down" size={14} class="transition-transform {open ? 'rotate-180' : ''}" />
						</button>{/if}
						<!-- Last, so an action's acts end on the same edge as those of its rules. -->
						<span data-row-isolated class="justify-self-end"><SpecControls {anchor} title={shown.text} values={shown} validates={!editable(anchor)} inline cites trailing /></span>
					</div>
					{#if open}<div class="col-span-full"><ActionDetails who={action.who} data={whole ? undefined : actionData[action.id]} /></div>{/if}
				{/if}
				<div data-row-isolated class="col-span-full empty:hidden"><BlockFoot {anchor} title={shown.text} /></div>
			</div>
			<div class="col-span-full pl-9 {whole ? 'hidden' : ''}">
				<button type="button" class={LINK} aria-expanded={rulesShown} aria-controls="action-rules-{action.id}" disabled={mode.active} onclick={() => ruleChoices.set(action.id, !rulesShown)}>{rulesShown ? 'Hide rules' : 'Show rules'} ({action.rules.length})</button>
			</div>
			{#if rulesShown}<div id="action-rules-{action.id}" class="col-span-full"><ActionRules {action} {featureId} onEdit={() => ruleChoices.set(action.id, true)} /></div>{/if}
		</li>
	{/each}
</ol>
{#if unproven}<p class="m-0 mt-3 text-xs text-ink-3">{unproven}</p>{/if}
