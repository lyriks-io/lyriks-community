<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '$ui/design-system';
	import { useEditMode } from './edit-mode.svelte';
	import { useEdits, type EditValues } from './edits.svelte';

	/**
	 * A list of texts of an element (a problem's symptoms) as fields of the Edit mode (criterion 41514698): each
	 * text a field with a × that removes it, + Add under them; what is typed is held until Save. Out of the mode,
	 * or for a reader who may not edit, it renders the page's own reading of the list (`children`).
	 */
	interface Props {
		anchor: string;
		read: EditValues;
		/** One text of the list, for the + Add and the screen reader: 'symptom'. */
		noun: string;
		editable?: boolean;
		/** The look of each text, as the page reads it. */
		itemClass?: string;
		children?: Snippet;
	}
	let { anchor, read, noun, editable = true, itemClass = '', children }: Props = $props();
	const mode = useEditMode();
	const edits = useEdits();

	const on = $derived(mode.active && editable && !!edits.shape(anchor)?.tags && edits.editing !== anchor);
	const tags = $derived(edits.current(anchor, read).tags ?? []);
	const changed = $derived(edits.changedTags(anchor, read));
	/** The index a new text was just added at: its field takes the focus. */
	let focusAt = $state<number | null>(null);

	const set = (i: number, value: string) => edits.stageTags(anchor, read, tags.map((t, k) => (k === i ? value : t)));
	const removeAt = (i: number) => edits.stageTags(anchor, read, tags.filter((_, k) => k !== i));
	function add() {
		focusAt = tags.length;
		edits.stageTags(anchor, read, [...tags, '']);
	}
</script>

{#if on}
	<ul class="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="{noun}s">
		{#each tags as tag, i (i)}
			<li class="{itemClass} flex items-center gap-2">
				<span
					role="textbox"
					tabindex="0"
					aria-label="{noun} {i + 1}"
					contenteditable="plaintext-only"
					spellcheck="true"
					data-placeholder="New {noun}"
					data-edited={changed || undefined}
					class="staged-text inline-block min-w-0 flex-1"
					{@attach (node: HTMLElement) => {
						$effect(() => {
							const text = tag;
							if (document.activeElement !== node && node.innerText !== text) node.innerText = text;
						});
						$effect(() => {
							if (focusAt !== i) return;
							focusAt = null;
							requestAnimationFrame(() => node.focus());
						});
					}}
					oninput={(e) => set(i, (e.currentTarget as HTMLElement).innerText.replace(/\n$/, ''))}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							add();
						}
					}}
				></span>
				<button
					type="button"
					class="grid size-6 flex-none cursor-pointer place-items-center border-0 bg-transparent text-ink-3 hover:bg-red-tint hover:text-red-ink"
					aria-label="Remove this {noun}"
					title="Remove this {noun}"
					onclick={() => removeAt(i)}><Icon name="x" size={13} /></button
				>
			</li>
		{/each}
		<li>
			<button
				type="button"
				class="inline-flex min-h-8 w-full cursor-pointer items-center justify-center border-[1.5px] border-dashed border-blue bg-blue-tint/45 px-3 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-blue-ink uppercase hover:bg-blue-tint"
				onclick={add}>+ Add a {noun}</button
			>
		</li>
	</ul>
{:else if children}
	{@render children()}
{/if}
