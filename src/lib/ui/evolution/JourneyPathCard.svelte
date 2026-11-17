<script lang="ts">
	import { Icon } from '$ui/design-system';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import type { JourneyPath } from '$domain/evolution';
	import BlockControls, { type ValidateControl } from './BlockControls.svelte';

	/**
	 * One path of the journey at the Specification (ac-evo-spec-journey-paths),
	 * read the way the Experience page reads a journey: its steps side by side,
	 * numbered, an arrow between them, who does each above its words, and under
	 * a step what the product refuses and what goes wrong. It carries its own
	 * Validate; the page decides what that does.
	 */
	interface Props {
		domId: string;
		number: number;
		path: JourneyPath;
		validate: ValidateControl | null;
		disabled?: boolean;
	}
	let { domId, number, path, validate, disabled = false }: Props = $props();
	/** Its Validate still waits on the reader: one of the blocks a validation brings into view next (ac-evo-form-validate-next). */
	const waitsOnReader = $derived(validate?.look === 'grey' && !!validate.run);

	const lanes = $derived([...new Set(path.flow.steps.map((s) => s.lane.trim()).filter(Boolean))]);
	const BRANCH = { refused: { word: 'Refused when', look: 'text-red-ink' }, goes_wrong: { word: 'Goes wrong when', look: 'text-orange-ink' } } as const;
</script>

<div id={domId} class="flex scroll-mt-36 flex-col gap-3 rounded-xl bg-evo-sunken px-4 py-3.5" data-evo-waits={waitsOnReader || null}>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="flex-none font-evo-mono text-xs tracking-[0.08em] text-ink-3">PATH {number}</span>
		<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] leading-normal font-bold">{path.useCase}</span>
		<span class="font-evo-mono text-xs text-ink-3">{path.flow.steps.length} {path.flow.steps.length === 1 ? 'step' : 'steps'}{lanes.length > 0 ? ` · ${lanes.join(', ')}` : ''}</span>
		<BlockControls {validate} {disabled} />
	</div>
	<div class="overflow-x-auto">
		<ol class="m-0 flex list-none items-stretch gap-1.5 p-0">
			{#each path.flow.steps as step, i (i)}
				<li class="flex w-[220px] shrink-0 flex-col gap-1.5 rounded-xl border-[1.5px] border-ink bg-paper p-2.5">
					<span class="flex items-center gap-1.5">
						<span class="grid h-5 min-w-5 place-items-center rounded bg-transparent px-1 font-evo-mono text-[0.625rem] font-bold text-blue-ink">{i + 1}</span>
						<span class="truncate font-evo-mono text-[0.625rem] tracking-[0.08em] text-ink-3 uppercase">{step.lane}</span>
					</span>
					<span class="text-[0.8125rem] leading-snug text-evo-ink"><GlossaryText text={step.text} /></span>
					{#each step.branches as branch, b (b)}
						<span class="text-[0.75rem] leading-snug text-ink-2"><b class="font-bold {BRANCH[branch.kind].look}">{BRANCH[branch.kind].word}</b> <GlossaryText text={branch.when} />: <GlossaryText text={branch.then} /></span>
					{/each}
				</li>
				{#if i < path.flow.steps.length - 1}
					<li class="flex shrink-0 items-center text-ink-3" aria-hidden="true"><Icon name="arrow-right" size={16} /></li>
				{/if}
			{/each}
		</ol>
	</div>
</div>
