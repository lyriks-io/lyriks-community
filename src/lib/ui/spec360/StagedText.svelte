<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { useEditMode } from './edit-mode.svelte';
	import { useEdits, type EditValues } from './edits.svelte';

	/**
	 * A text of the Specification 360° that becomes a field where it stands in
	 * the Edit mode (criterion 41514698): a blue dashed outline around it, an
	 * orange mark once changed. What is typed is held by the page until Save,
	 * never written here. Out of the mode, or for a reader who may not edit,
	 * it renders the page's own reading of the text (`children`), or the text
	 * itself.
	 */
	interface Props {
		anchor: string;
		/** The element's fields as the page reads them. */
		read: EditValues;
		field: 'text' | 'desc';
		/** A text of several lines (a summary, a description): Enter adds a line instead of ending it. */
		multiline?: boolean;
		/** What it is, for a screen reader and for an empty field. */
		label: string;
		/** What an empty field says; its label otherwise. */
		placeholder?: string;
		/** At most this many characters: a count under the field while it is typed, red past it; the save refuses more (criterion 72251131). */
		max?: number;
		/** The element may be changed here (the page's own rule: a draft, its writer). */
		editable?: boolean;
		class?: string;
		children?: Snippet;
	}
	let { anchor, read, field, multiline = false, label, placeholder, max, editable = true, class: klass = '', children }: Props = $props();
	const mode = useEditMode();
	const edits = useEdits();

	const on = $derived(mode.active && editable && !!edits.shape(anchor) && (field === 'text' || !!edits.shape(anchor)?.desc) && edits.editing !== anchor);
	const value = $derived(edits.current(anchor, read)[field] ?? '');
	const changed = $derived(edits.changed(anchor, read, field));
	const length = $derived(value.trim().length);

	/** The field shows the held text, never under the caret: dropped changes put it back once the field is left. */
	const holds: Attachment<HTMLElement> = (node) => {
		$effect(() => {
			const text = value;
			if (document.activeElement !== node && node.innerText !== text) node.innerText = text;
		});
		// An element just added: its name takes the focus, selected for typing over (criterion 41514698).
		$effect(() => {
			if (field !== 'text' || edits.focusOn !== anchor) return;
			edits.focusOn = null;
			requestAnimationFrame(() => {
				node.focus();
				node.scrollIntoView({ block: 'center' });
				const range = document.createRange();
				range.selectNodeContents(node);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			});
		});
	};
</script>

{#if on}
	<span
		role="textbox"
		tabindex="0"
		aria-label={label}
		aria-multiline={multiline}
		contenteditable="plaintext-only"
		spellcheck="true"
		data-placeholder={placeholder ?? label}
		data-edited={changed || undefined}
		class="staged-text {multiline ? 'block whitespace-pre-wrap' : 'inline-block'} {klass}"
		{@attach holds}
		oninput={(e) => edits.stage(anchor, read, field, (e.currentTarget as HTMLElement).innerText.replace(/\n$/, ''))}
		onblur={(e) => {
			const node = e.currentTarget as HTMLElement;
			if (node.innerText !== value) node.innerText = value;
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' && !multiline) {
				e.preventDefault();
				(e.currentTarget as HTMLElement).blur();
			}
		}}
	></span>
	{#if max}
		<span class="block font-evo-mono text-[0.6875rem] tabular-nums {length > max ? 'font-bold text-red-ink' : 'text-ink-3'}" aria-live="polite" data-count
			>{length} / {max}</span
		>
	{/if}
{:else if children}
	{@render children()}
{:else}
	<span class={klass}>{value}</span>
{/if}
