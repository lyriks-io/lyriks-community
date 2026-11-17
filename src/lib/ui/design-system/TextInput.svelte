<script lang="ts">
	import { fieldBase, fieldBorder, fieldBorderEmpty, fieldBorderInvalid, fieldHeight } from './field';
	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		type?: 'text' | 'email' | 'url';
		invalid?: boolean;
		/** Fires with the new value on every keystroke (controlled input). */
		oninput?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		/** Fires with the value when the field loses focus: a field saved on leaving it. */
		onblur?: (value: string) => void;
		class?: string;
	}
	let {
		value,
		id,
		placeholder,
		type = 'text',
		invalid = false,
		oninput,
		onkeydown,
		onblur,
		class: klass = ''
	}: Props = $props();
</script>

<input
	{id}
	{type}
	{value}
	{placeholder}
	{onkeydown}
	oninput={(e) => oninput?.(e.currentTarget.value)}
	onblur={(e) => onblur?.(e.currentTarget.value)}
	aria-invalid={invalid}
	class="{fieldBase} {fieldHeight} px-3.5 py-2.5 {invalid
		? fieldBorderInvalid
		: value
			? fieldBorder
			: fieldBorderEmpty} {klass}"
/>
