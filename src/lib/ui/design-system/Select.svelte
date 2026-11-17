<script lang="ts">
	import Icon from './Icon.svelte';
	import { fieldBase, fieldBorder, fieldHeight } from './field';

	interface SelectOption {
		code: string;
		label: string;
	}
	interface Props {
		value: string;
		options: readonly SelectOption[];
		id?: string;
		onchange?: (value: string) => void;
		disabled?: boolean;
		class?: string;
	}
	let { value, options, id, onchange, disabled = false, class: klass = '' }: Props = $props();
</script>

<div class="relative {klass}">
	<select
		{id}
		{disabled}
		onchange={(e) => onchange?.(e.currentTarget.value)}
		class="{fieldBase} {fieldHeight} {fieldBorder} appearance-none py-2.5 pl-3.5 pr-10 disabled:cursor-not-allowed disabled:text-ink-500"
	>
		{#each options as opt (opt.code)}
			<option value={opt.code} selected={opt.code === value}>{opt.label}</option>
		{/each}
	</select>
	<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
		<Icon name="chevron-down" size={18} />
	</span>
</div>
