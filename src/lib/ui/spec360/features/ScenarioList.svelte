<script lang="ts">
	import type { ScenarioView } from '$application/spec360/features';
	import { Icon } from '$ui/design-system';
	import DisabledBadge from './DisabledBadge.svelte';
	import ElementMenu from './ElementMenu.svelte';
	import { proofLabel } from './scenario-line';

	const PROOF_LOOK = {
		proven: { icon: 'check', ink: 'text-green-ink' },
		failing: { icon: 'x', ink: 'text-red-ink' },
		unproven: { icon: 'circle-dashed', ink: 'text-ink-3' }
	} as const;

	/**
	 * An action's scenarios opened: each as Given / When / Then exactly as Lyriks
	 * writes it from the model, its proof against the code, and the element
	 * menu (criterion 978057c9). A disabled scenario reads greyed with its badge.
	 */
	let { featureId, scenarios }: { featureId: string; scenarios: readonly ScenarioView[] } = $props();
</script>

<ul class="m-0 mt-1 flex list-none flex-col gap-2 p-0">
	{#each scenarios as scenario (scenario.id)}
		<li class="flex items-start gap-2.5 border-l-2 border-line pl-2.5" data-scenario={scenario.id}>
			<span class="mt-0.5 flex size-4 flex-none items-center justify-center {PROOF_LOOK[scenario.proof].ink}" title={proofLabel(scenario.proof)} data-proof={scenario.proof}>
				<Icon name={PROOF_LOOK[scenario.proof].icon} size={14} />
				<span class="sr-only">{proofLabel(scenario.proof)}</span>
			</span>
			<div class="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5 {scenario.disabled ? 'opacity-60' : ''}" data-disabled={scenario.disabled ? true : undefined}>
				<span class="text-xs font-semibold text-ink-2">{scenario.name}</span>
				<span class="text-sm leading-normal whitespace-pre-line [overflow-wrap:anywhere]">{scenario.statement}</span>
				{#if scenario.disabled}<DisabledBadge marker={scenario.disabled} />{/if}
			</div>
			<span class="ml-auto flex-none"><ElementMenu {featureId} elementId={scenario.id} title={scenario.name} disabled={scenario.disabled} /></span>
		</li>
	{/each}
</ul>
