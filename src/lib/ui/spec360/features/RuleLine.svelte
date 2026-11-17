<script lang="ts">
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { ActionRule } from '$application/spec360/features';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import RuleVerdictMark from '$ui/rules/RuleVerdictMark.svelte';
	import { getRuleVerdicts } from '$ui/rules/rule-verdicts.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import RuleEditor from './RuleEditor.svelte';
	import { LINK } from '../page/look';

	/**
	 * One rule an action obeys, as one line (criterion 7d1e80b6): what the
	 * solver says about it first (criterion be4c97ee), then its sentence with
	 * its EARS keywords standing out, or, under a sentence its action's refusals
	 * share, its condition and the message it shows; its acts close the line. A
	 * flaw reads its proof in full under the line.
	 */
	interface Props {
		rule: ActionRule;
		featureId: string;
		actionId: string;
		onEdit?: () => void;
		/** The words the line reads: the rule's whole sentence, or its condition under a shared one. */
		text: string;
		/** What a refusal shows. */
		message?: string;
	}
	let { rule, featureId, actionId, onEdit, text, message = '' }: Props = $props();
	const validation = useValidation();
	const verdicts = getRuleVerdicts();
	const anchor = $derived(anchorOf('rule', featureId, rule.id));
	const verdict = $derived(verdicts?.ruleVerdict(featureId, rule.id));
	const mode = useEditMode();
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite && rule.kind === 'rule');
	let editing = $state(false);
</script>

<li id={anchorDomId(anchor)} data-evo-waits={validation.waitsOnMe(anchor) || undefined} class="flex scroll-mt-44 flex-col pl-2.5">
	<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1">
		<span class="flex size-4 flex-none items-center justify-center">{#if verdict}<RuleVerdictMark {verdict} />{/if}</span>
		<span class="min-w-0 flex-[1_1_260px] text-sm leading-normal [overflow-wrap:anywhere]"
			><EarsText {text} variables={rule.refusal && text === rule.refusal.case ? rule.refusal.variables : rule.variables} />{#if message}<span class="ml-2 font-evo-mono text-xs text-violet-ink">shows “{message}”</span>{/if}</span
		>
		<span class="ml-auto flex flex-none items-center gap-2">{#if editable}<button type="button" class={LINK} onclick={() => { onEdit?.(); editing = true; }}>Edit rule</button>{/if}<SpecControls {anchor} title={rule.text} validates={!editing} trailing /></span>
	</div>
	<!-- A flaw shows its proof in full: the reader decides from it, not from a tooltip. -->
	{#if verdict?.flaw && verdict.detail}
		<div class="mb-1 ml-[26px] bg-red-tint px-2.5 py-1.5 text-xs leading-snug text-ink">
			<p class="m-0">{verdict.detail}</p>
			{#if verdict.fix}<p class="m-0 mt-0.5 text-ink-2">{verdict.fix}</p>{/if}
		</div>
	{/if}
	<BlockFoot {anchor} title={rule.text} named={!!message} />
	{#if editing}<RuleEditor {featureId} {actionId} ruleId={rule.id} close={() => editing = false} />{/if}
</li>
