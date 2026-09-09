<script lang="ts">
	import Icon from './Icon.svelte';

	interface SelectOption {
		code: string;
		label: string;
	}
	interface Props {
		value: string;
		options: readonly SelectOption[];
		id?: string;
		onchange?: (value: string) => void;
		class?: string;
	}
	let { value, options, id, onchange, class: klass = '' }: Props = $props();
</script>

<div class="relative {klass}">
	<select
		{id}
		onchange={(e) => onchange?.(e.currentTarget.value)}
		class="h-12 w-full appearance-none rounded-field border border-line bg-surface-sunken py-2.5 pl-3.5 pr-10 text-sm text-ink-900 transition-colors hover:border-line-strong focus:border-brand-400"
	>
		{#each options as opt (opt.code)}
			<option value={opt.code} selected={opt.code === value}>{opt.label}</option>
		{/each}
	</select>
	<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
		<Icon name="chevron-down" size={18} />
	</span>
</div>
