<script lang="ts">
	import { useEdits } from './edits.svelte';
	import { useCardGrid } from './card-grid.svelte';
	import ClassificationEditor from './ClassificationEditor.svelte';
	import { CHIP, FIELD, PRESS_FILL, QUIET } from './page/look';

	/**
	 * An element of the Specification 360° being edited in place: its title (a
	 * line, or a paragraph for the product's summary, problem and target), its
	 * description, its tags, the product's type for its summary, then Cancel and
	 * Save. Shown in place of the text it edits while the pencil is on.
	 */
	interface Props {
		anchor: string;
	}
	let { anchor }: Props = $props();
	const edits = useEdits();
	const grid = useCardGrid();
	const shape = $derived(edits.shape(anchor));
	const long = $derived(shape?.section === 'identity' || shape?.section === 'definition');
	// The design's field (.ly-input) under its label (.ly-field label); the field resets what the label sets on its text.
	const field = `w-full box-border ${FIELD} px-3 py-2 font-evo text-[0.9375rem] leading-normal font-normal tracking-normal normal-case`;
	const LABEL = 'font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase';

	function onTagKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			edits.addTag();
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close(() => edits.cancel(), e.target);
	}
	// In a grid of small cards the card spans its row while edited: it folds back with the grid's motion.
	function close(change: () => void, from: EventTarget | null) {
		if (grid) void grid.run(change, from instanceof Element ? from : null);
		else change();
	}
</script>

{#if shape && edits.editing === anchor}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="animate-lk-in-fast flex w-full flex-col gap-2 rounded-xl border-2 border-ink bg-paper p-3" onkeydown={onKey}>
		<label class="flex flex-col gap-1 {LABEL}">
			{shape.text}
			{#if long}
				<!-- As tall as its text, never a few lines that scroll (criterion 416e4885); rows is the fallback where field-sizing is unknown. -->
				<textarea rows="3" class="{field} field-sizing-content min-h-24 max-h-[60vh]" bind:value={edits.text}></textarea>
			{:else}
				<input class={field} bind:value={edits.text} />
			{/if}
		</label>
		{#if shape.desc}
			<label class="flex flex-col gap-1 {LABEL}">
				{shape.desc}
				<textarea rows="2" class={field} bind:value={edits.desc}></textarea>
			</label>
		{/if}
		{#if shape.tags}
			<span class={LABEL}>{shape.tags}</span>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each edits.tags as tag, i (tag)}
					<span class="inline-flex items-center gap-1 {CHIP} py-0.5 pr-1 pl-2.5">
						{tag}
						<button type="button" aria-label="Remove {tag}" class="grid size-6 place-items-center text-evo-muted" onclick={() => edits.removeTag(i)}>×</button>
					</span>
				{/each}
				<input aria-label="Add" placeholder="+ Add, then Enter" class="min-h-8 flex-[1_1_160px] border-[1.5px] border-dashed border-ink-3 bg-toner-1 px-3 text-[0.8125rem] outline-none focus:border-blue" bind:value={edits.tagIn} onkeydown={onTagKey} />
			</div>
		{/if}
		{#if edits.classification}
			<span class={LABEL}>Type</span>
			<ClassificationEditor />
		{/if}
		<div class="flex justify-end gap-2">
			<button type="button" class={QUIET} onclick={(e) => close(() => edits.cancel(), e.currentTarget)}>Cancel</button>
			<button type="button" class="{PRESS_FILL} min-h-9 px-4 text-xs" onclick={(e) => close(() => void edits.save(), e.currentTarget)}>Save</button>
		</div>
	</div>
{/if}
