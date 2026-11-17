<script lang="ts">
	import CelebrationDialog from '$ui/shell/CelebrationDialog.svelte';
	import CelebrationFigures from '$ui/shell/CelebrationFigures.svelte';
	import { PRIMARY_44, SECONDARY_44 } from '$ui/evolution/evo-look';
	import type { RunDelta } from '$domain/retrospec';

	/**
	 * The retrospecification just ended: the person is congratulated on the step,
	 * told what Lyriks rebuilt and how much of it the code holds, warned when the
	 * final check could not confirm everything, and pointed at what comes next:
	 * the team validates the Specification 360°. A later run counts what it
	 * changed, when that is known (criterion 03192a6e).
	 */
	interface Props {
		/** What Lyriks did, naming what this run read. */
		line: string;
		delta?: RunDelta | null;
		/** What comes next and the way there, when it is not the validation in Knowledge. */
		next?: { readonly line: string; readonly label: string } | null;
		counts: { readonly features: number; readonly actions: number; readonly rules: number; readonly screens: number };
		unconfirmed: { readonly points: number } | null;
		onClose: () => void;
		onOpenSpec: () => void;
	}
	let { line, delta = null, next = null, counts, unconfirmed, onClose, onOpenSpec }: Props = $props();

	const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
	const figures = $derived(delta?.since ? [
		{ value: delta.added.length, label: 'new' },
		{ value: delta.changed.length, label: 'changed' },
		{ value: delta.removed.length, label: 'removed' }
	] : [
		{ value: counts.features, label: counts.features === 1 ? 'feature' : 'features' },
		{ value: counts.actions, label: counts.actions === 1 ? 'action' : 'actions' },
		{ value: counts.rules, label: counts.rules === 1 ? 'rule' : 'rules' },
		{ value: counts.screens, label: counts.screens === 1 ? 'screen' : 'screens' }
	]);
</script>

<CelebrationDialog label="Reverse-Specification complete" kicker="REVERSE-SPECIFICATION COMPLETE" title="Congratulations!" {onClose}>
		<span class="text-[0.9375rem] leading-[1.55] text-ink-2">{line}</span>
		<CelebrationFigures {figures} />
		{#if unconfirmed}
			<span class="w-full border-l-[6px] border-orange bg-orange-tint px-3.5 py-2.5 text-left text-[0.8125rem] leading-normal text-ink-2"
				><b class="text-ink">{n(unconfirmed.points, 'point')} could not be confirmed.</b> Nothing to do now: {unconfirmed.points === 1 ? 'it waits' : 'they wait'} for you under "Could not be confirmed" in Health, with what each one means.</span
			>
		{/if}
		<span class="text-sm leading-normal text-ink-2">{next?.line ?? 'Next: your team checks the specification in Knowledge, element by element, and validates it.'}</span>
		<div class="mt-1.5 flex flex-wrap justify-center gap-2.5">
			<button type="button" class={SECONDARY_44} onclick={onClose}>See the summary</button>
			<button
				type="button"
				class={PRIMARY_44}
				onclick={() => {
					onClose();
					onOpenSpec();
				}}>{next?.label ?? 'Validate in Knowledge →'}</button
			>
		</div>
</CelebrationDialog>
