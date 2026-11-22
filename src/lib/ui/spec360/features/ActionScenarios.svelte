<script lang="ts">
	import type { FeatureActionView } from '$application/spec360/features';
	import { Icon } from '$ui/design-system';
	import RuleVerdictMark from '$ui/rules/RuleVerdictMark.svelte';
	import { getRuleVerdicts } from '$ui/rules/rule-verdicts.svelte';
	import { LINK } from '$ui/spec360/page/look';
	import ScenarioList from './ScenarioList.svelte';
	import { scenarioLine, scenarioTally } from './scenario-line';

	/**
	 * One closed line under an action: its scenarios and their proof, with the
	 * prover's seal the action carries (criterion 2c64761b). Opening it lists them
	 * (criterion 978057c9); it starts closed on every visit, and nothing else on
	 * the page moves.
	 */
	let { featureId, action }: { featureId: string; action: FeatureActionView } = $props();
	const verdicts = getRuleVerdicts();
	const scenarios = $derived(action.scenarios ?? []);
	const line = $derived(scenarioLine(scenarioTally(scenarios)));
	const verdict = $derived(verdicts?.actionVerdict(featureId, action.id));
	let open = $state(false);
</script>

<div class="flex flex-col" data-action-scenarios={action.id}>
	<span class="flex items-center gap-1.5">
		{#if verdict}<RuleVerdictMark {verdict} />{/if}
		{#if scenarios.length === 0}
			<span class="text-[0.8125rem] text-ink-3">{line}</span>
		{:else}
			<button type="button" class={LINK} aria-expanded={open} aria-controls="action-scenarios-{action.id}" onclick={() => (open = !open)}>
				{line}<Icon name="chevron-down" size={14} class="transition-transform {open ? 'rotate-180' : ''}" />
			</button>
		{/if}
	</span>
	{#if open}<div id="action-scenarios-{action.id}"><ScenarioList {featureId} {scenarios} /></div>{/if}
</div>
