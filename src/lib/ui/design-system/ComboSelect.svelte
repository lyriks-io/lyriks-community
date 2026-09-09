<script lang="ts">
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	interface SelectOption {
		code: string;
		label: string;
	}
	interface Props {
		value: string;
		options: readonly SelectOption[];
		/** Placeholder of the free-text input once "Custom…" is picked. */
		placeholder?: string;
		id?: string;
		onchange?: (value: string) => void;
		class?: string;
	}
	let { value, options, placeholder = 'Type your own…', id, onchange, class: klass = '' }: Props = $props();

	// A catalog Select with a trailing "Custom…" entry that swaps to a free-text
	// input, so authors are never boxed in by the built-in vocabulary. A stored
	// value outside the catalog opens in custom mode; the list button returns to
	// the catalog (first option).
	const CUSTOM = '__custom__';
	const known = $derived(options.some((o) => o.code === value));
	let forcedCustom = $state<boolean | null>(null);
	const customMode = $derived(forcedCustom ?? (!known && value.trim() !== ''));

	function onSelect(code: string) {
		if (code === CUSTOM) {
			forcedCustom = true;
			onchange?.('');
		} else {
			forcedCustom = false;
			onchange?.(code);
		}
	}
	function backToList() {
		forcedCustom = false;
		onchange?.(options[0]?.code ?? '');
	}
</script>

{#if customMode}
	<div class="flex items-center gap-1.5 {klass}">
		<input
			{id}
			value={known ? '' : value}
			{placeholder}
			oninput={(e) => onchange?.(e.currentTarget.value)}
			class="h-12 w-full min-w-0 flex-1 rounded-field border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-900 outline-none transition-colors hover:border-line-strong focus:border-brand-400"
		/>
		<button
			type="button"
			onclick={backToList}
			class="grid size-12 shrink-0 place-items-center rounded-field border border-line bg-surface-sunken text-ink-400 transition hover:border-line-strong hover:text-ink-700"
			aria-label="Back to the built-in list"
			title="Back to the built-in list"
		>
			<Icon name="list" size={15} />
		</button>
	</div>
{:else}
	<Select
		{id}
		{value}
		options={[...options, { code: CUSTOM, label: 'Custom…' }]}
		onchange={onSelect}
		class={klass}
	/>
{/if}
