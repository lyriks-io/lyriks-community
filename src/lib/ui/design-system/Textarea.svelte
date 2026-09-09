<script lang="ts">
	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		rows?: number;
		invalid?: boolean;
		oninput?: (value: string) => void;
		class?: string;
	}
	let { value, id, placeholder, rows = 4, invalid = false, oninput, class: klass = '' }: Props =
		$props();
</script>

<textarea
	{id}
	{rows}
	{value}
	{placeholder}
	oninput={(e) => oninput?.(e.currentTarget.value)}
	aria-invalid={invalid}
	class="field-sizing-content w-full resize-none rounded-field border px-3.5 py-2.5 text-sm leading-relaxed text-ink-900 transition-colors placeholder:text-ink-400 {invalid
		? 'border-danger-500 bg-surface'
		: value
			? 'border-line bg-surface-sunken/60 hover:border-line-strong focus:border-brand-400 focus:bg-surface'
			: 'border-warning-200 bg-warning-50 hover:border-warning-300 focus:border-brand-400 focus:bg-surface'} {klass}"
></textarea>
