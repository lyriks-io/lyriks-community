<script lang="ts">
	/**
	 * Inline click-to-edit text, a light-mode port of the mockup's `EditText` primitive.
	 * Idle it renders as plain text — no visible field — that tints its background
	 * faintly on hover; clicking (or Enter/Space) swaps in an autofocused editor.
	 * Commits on blur or Enter (single-line); Escape cancels. Pass typography via
	 * `class` so the editor and the resting text share the exact same look.
	 */
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { replaceOccurrence } from '$domain/glossary';

	interface Props {
		value: string;
		/** Fires once, with the new value, when an edit is committed (blur / Enter). */
		onCommit: (value: string) => void;
		placeholder?: string;
		multiline?: boolean;
		ariaLabel?: string;
		class?: string;
	}
	let {
		value,
		onCommit,
		placeholder = 'Click to edit',
		multiline = false,
		ariaLabel,
		class: klass = ''
	}: Props = $props();

	let editing = $state(false);
	let tmp = $state(''); // synced from `value` by the effect below while idle
	let el = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	// Mirror the upstream value while idle; never clobber what the user is typing.
	$effect(() => {
		if (!editing) tmp = value;
	});

	// Autofocus and drop the caret at the end when entering edit mode.
	$effect(() => {
		if (editing && el) {
			el.focus();
			const end = el.value.length;
			el.setSelectionRange(end, end);
		}
	});

	function startEdit() {
		tmp = value;
		editing = true;
	}
	function commit() {
		editing = false;
		if (tmp !== value) onCommit(tmp);
	}
	function cancel() {
		tmp = value;
		editing = false;
	}
	function onDisplayKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			startEdit();
		}
	}
	function onInputKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}
</script>

{#if editing}
	{#if multiline}
		<!-- `field-sizing-content` makes the editor grow to the text's real height
		     (wrapped lines included), so edit-mode height matches the resting
		     display height instead of collapsing to a fixed 2-row box. `rows={1}`
		     is just the floor; py matches the display div for pixel parity. -->
		<textarea
			bind:this={el}
			bind:value={tmp}
			onblur={commit}
			onkeydown={(e) => e.key === 'Escape' && cancel()}
			aria-label={ariaLabel ?? 'Field editor'}
			rows={1}
			class="field-sizing-content w-full resize-none border border-blue bg-surface-sunken px-1.5 py-0.5 text-ink outline-none {klass}"
		></textarea>
	{:else}
		<input
			bind:this={el}
			bind:value={tmp}
			onblur={commit}
			onkeydown={onInputKey}
			aria-label={ariaLabel ?? 'Field editor'}
			class="w-full border border-blue bg-surface-sunken px-2 py-0.5 text-ink outline-none {klass}"
		/>
	{/if}
{:else}
	<div
		role="button"
		tabindex="0"
		aria-label={ariaLabel ?? (value ? `Edit: ${value}` : `Edit field ${placeholder}`)}
		onclick={startEdit}
		onkeydown={onDisplayKey}
		class="-mx-1 cursor-text border bg-surface px-1.5 py-0.5 transition-colors {klass} {value
			? 'border-line hover:border-ink'
			: 'border-orange italic text-ink-3 hover:border-orange-ink'}"
	>
		{#if value}
			<GlossaryText
				text={value}
				onFix={({ original, canonical }) => onCommit(replaceOccurrence(value, original, canonical))}
			/>
		{:else}
			{placeholder}
		{/if}
	</div>
{/if}
