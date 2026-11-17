<script lang="ts">
	import { Icon } from '$ui/design-system';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import BlockControls, { type ValidateControl } from './BlockControls.svelte';
	import { TAG, TAG_TONE } from './evo-look';

	/**
	 * One change to another page of the spec at the Specification
	 * (ac-evo-draft-section-read): the page as the spec names it, what the change
	 * does in the person's words, then each value it moves as it is and as it
	 * would be, under the place the page shows it. It carries its own Validate;
	 * the page decides what that does. A change to the rules the whole product
	 * keeps reads the same, each rule as one EARS sentence (ac-evo-draft-rules).
	 */
	interface ChangeReading {
		readonly id: string;
		readonly pageName: string;
		readonly summary: string;
		readonly noLongerApplies?: string | null;
		readonly changes: readonly { readonly label: string; readonly before: string; readonly after: string }[];
	}
	interface Props {
		domId: string;
		number: number;
		change: ChangeReading;
		validate: ValidateControl | null;
		disabled?: boolean;
	}
	let { domId, number, change, validate, disabled = false }: Props = $props();
	const waitsOnReader = $derived(validate?.look === 'grey' && !!validate.run);
</script>

<div id={domId} class="flex scroll-mt-36 flex-col gap-3 rounded-xl bg-evo-sunken px-4 py-3.5" data-evo-waits={waitsOnReader || null} data-section-change={change.id}>
	<div class="flex flex-wrap items-center gap-2.5">
		<span class="flex-none font-evo-mono text-xs tracking-[0.08em] text-ink-3">CHANGE {number}</span>
		<span class="px-2.5 py-0.5 text-[0.6875rem] {TAG} {TAG_TONE.blue}">{change.pageName}</span>
		<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] leading-normal font-bold"><GlossaryText text={change.summary} /></span>
		{#if change.noLongerApplies}
			<span class="inline-flex items-center gap-1 font-evo-mono text-xs font-bold text-red-ink uppercase" title={change.noLongerApplies}><Icon name="alert-triangle" size={13} />No longer applies</span>
		{/if}
		<BlockControls {validate} {disabled} />
	</div>
	<ul class="m-0 flex list-none flex-col gap-2 p-0">
		{#each change.changes as value, i (i)}
			<li class="flex flex-col gap-1 rounded-xl border border-line bg-paper p-2.5">
				<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">{value.label}</span>
				<div class="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
					<span class="text-[0.8125rem] leading-snug whitespace-pre-wrap text-evo-muted {value.before ? 'line-through decoration-red' : 'italic'}">{value.before || 'Nothing yet'}</span>
					<span class="hidden text-ink-3 sm:block" aria-hidden="true"><Icon name="arrow-right" size={16} /></span>
					<span class="text-[0.8125rem] leading-snug whitespace-pre-wrap text-evo-ink {value.after ? '' : 'italic text-evo-muted'}">{value.after || 'Removed'}</span>
				</div>
			</li>
		{/each}
	</ul>
</div>
