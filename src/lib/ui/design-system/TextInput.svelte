<script lang="ts">
	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		type?: 'text' | 'email' | 'url';
		invalid?: boolean;
		/** Fires with the new value on every keystroke (controlled input). */
		oninput?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
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
	aria-invalid={invalid}
	class="h-12 w-full rounded-field border px-3.5 py-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-400 {invalid
		? 'border-danger-500 bg-surface'
		: value
			? 'border-line bg-surface-sunken/60 hover:border-line-strong focus:border-brand-400 focus:bg-surface'
			: 'border-warning-200 bg-warning-50 hover:border-warning-300 focus:border-brand-400 focus:bg-surface'} {klass}"
/>
