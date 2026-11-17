<script lang="ts">
	import { Icon } from '$ui/design-system';
	import CelebrationDialog from '$ui/shell/CelebrationDialog.svelte';
	import CelebrationFigures from '$ui/shell/CelebrationFigures.svelte';
	import type { LiveCelebration } from './live-celebration';
	import { PRIMARY_44, SECONDARY_44 } from './evo-look';

	/**
	 * The evolution just went live (ac-evo-verd-live-celebration): the person is
	 * congratulated, told what became official and whether all of it is in the
	 * Specification 360°, and pointed at what comes next.
	 */
	interface Props {
		celebration: LiveCelebration;
		onClose: () => void;
		onOpenSpec: () => void;
	}
	let { celebration, onClose, onOpenSpec }: Props = $props();
</script>

<CelebrationDialog label="Evolution live" kicker="EVOLUTION LIVE" title={celebration.title} {onClose}>
	<span class="text-[0.9375rem] leading-[1.55] text-ink-2">{celebration.lead}</span>
	{#if celebration.figures.length > 0}<CelebrationFigures figures={celebration.figures} />{/if}
	{#if celebration.check}
		<span class="flex items-center gap-1.5 font-evo-mono text-xs font-bold {celebration.check.whole ? 'text-green-ink' : 'text-red-ink'}">
			<Icon name={celebration.check.whole ? 'check' : 'circle-alert'} size={14} />{celebration.check.text}
		</span>
	{/if}
	<span class="text-sm leading-normal text-ink-2">{celebration.next}</span>
	<div class="mt-1.5 flex flex-wrap justify-center gap-2.5">
		<button type="button" class={SECONDARY_44} onclick={onClose}>See what happened</button>
		<button
			type="button"
			class={PRIMARY_44}
			onclick={() => {
				onClose();
				onOpenSpec();
			}}>Open Knowledge →</button
		>
	</div>
</CelebrationDialog>
