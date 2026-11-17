<script lang="ts">
	import { fieldBase, fieldBorder, fieldBorderEmpty, fieldBorderInvalid } from './field';
	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		rows?: number;
		invalid?: boolean;
		oninput?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		class?: string;
	}
	let { value, id, placeholder, rows = 4, invalid = false, oninput, onkeydown, class: klass = '' }: Props =
		$props();
</script>

<textarea
	{id}
	{rows}
	{value}
	{placeholder}
	oninput={(e) => oninput?.(e.currentTarget.value)}
	{onkeydown}
	aria-invalid={invalid}
	class="{fieldBase} field-sizing-content min-h-12 resize-none px-3.5 py-2.5 leading-relaxed {invalid
		? fieldBorderInvalid
		: value
			? fieldBorder
			: fieldBorderEmpty} {klass}"
></textarea>
