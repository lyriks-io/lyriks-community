<script lang="ts">
	import AddButton from '../page/AddButton.svelte';
	import type { FeatureActionView } from '$application/spec360/features';
	import { groupedRuleLines } from '$application/spec360/rule-lines';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import RuleLine from './RuleLine.svelte';
	import RuleEditor from './RuleEditor.svelte';
	import { useEditMode } from '../edit-mode.svelte';
	import { useValidation } from '../validation.svelte';

	/**
	 * Saved categories group the rules without interpreting their sentences
	 * (criterion ad995374). Each group keeps the declared order, sharing a
	 * refusal sentence only across consecutive refusals (criterion d9c7ce1a).
	 * RuleLine retains the same rule identity and its acts (criterion 821ec8f9).
	 */
	let { action, featureId, onEdit }: { action: FeatureActionView; featureId: string; onEdit?: () => void } = $props();
	const groups = $derived(groupedRuleLines(action));
	const mode = useEditMode();
	const validation = useValidation();
	const editable = $derived(mode.active && validation.draft && validation.source.canWrite);
	let adding = $state(false);
	/** The coloured edge that tells the groups apart at a glance. */
	const EDGE: Record<string, string> = { product: 'border-l-blue-ink', technical: 'border-l-ink-3', other: 'border-l-line' };
</script>

{#if action.rules.length}
	<div class="flex flex-col gap-4">
		{#each groups as group (group.kind)}
			{@const count = group.runs.reduce((n, r) => n + r.refusals.length + r.others.length, 0)}
			<!-- Each group in its own framed block, a coloured edge telling them apart (criterion ad995374). -->
			<section aria-label={group.title} class="border-[1.5px] border-l-[5px] border-line pb-1 {EDGE[group.kind] ?? EDGE.other}">
				<h4 class="m-0 mb-1 flex items-baseline gap-2 border-b border-line bg-toner py-2 pl-9 text-base font-bold text-ink-2" title="Grouped by saved category, without interpreting the rule’s text.">{group.title}<span class="font-evo-mono text-xs font-normal text-ink-3">{count}</span></h4>
				{#each group.runs as lines}
					{#if lines.lead}<p class="m-0 py-1 pl-9 text-sm leading-normal [overflow-wrap:anywhere]"><EarsText text={lines.lead} /></p>{/if}
					<ul class="m-0 flex list-none flex-col p-0">
						{#each lines.refusals as r (r.rule.id)}<RuleLine rule={r.rule} {featureId} {onEdit} actionId={action.id} text={r.condition} message={r.message} />{/each}
						{#each lines.others as rule (rule.id)}<RuleLine {rule} {featureId} {onEdit} actionId={action.id} text={rule.text} />{/each}
					</ul>
				{/each}
			</section>
		{/each}
	</div>
{:else}
	<p class="m-0 py-1 pl-9 text-sm text-ink-3">No rule: the behavior model sets no condition on this action.</p>
{/if}
{#if editable}<div class="ml-9"><AddButton label="Add a rule" onclick={() => { onEdit?.(); adding = true; }} /></div>{/if}
{#if adding}<RuleEditor {featureId} actionId={action.id} close={() => adding = false} />{/if}
