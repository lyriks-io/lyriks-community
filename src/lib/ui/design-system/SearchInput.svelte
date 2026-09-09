<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * The one search bar every list uses. It exists so "filter this list" looks
	 * and behaves identically across Rules, Roadmap, Features, Data, Experience
	 * and the rest: magnifier on the left, a clear affordance on the right once
	 * something is typed, Escape to clear, and filtering on every keystroke (the
	 * value is plain state - no debounce, the lists are client-side).
	 */
	interface Props {
		/** Bindable, so a caller can use `bind:value` or the `oninput` callback. */
		value?: string;
		placeholder?: string;
		/** Accessible name; defaults to the placeholder. */
		label?: string;
		/** `sm` for dense toolbars inside a card, `md` for a page-level toolbar. */
		size?: 'sm' | 'md';
		/** e.g. "12 of 40 rules" - rendered under the field while a query is active. */
		resultLabel?: string | null;
		disabled?: boolean;
		oninput?: (value: string) => void;
		class?: string;
	}
	let {
		value = $bindable(''),
		placeholder = 'Search…',
		label,
		size = 'sm',
		resultLabel = null,
		disabled = false,
		oninput,
		class: klass = ''
	}: Props = $props();

	function set(next: string) {
		value = next;
		oninput?.(next);
	}
</script>

<div class="min-w-0 {klass}">
	<div class="relative">
		<span
			class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-400"
		>
			<Icon name="search" size={size === 'md' ? 15 : 13} />
		</span>
		<input
			type="search"
			{placeholder}
			{disabled}
			aria-label={label ?? placeholder}
			{value}
			oninput={(e) => set(e.currentTarget.value)}
			onkeydown={(e) => {
				if (e.key === 'Escape' && value) {
					e.stopPropagation();
					set('');
				}
			}}
			class="w-full rounded-pill border border-line bg-surface text-ink-900 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60 {size ===
			'md'
				? 'py-2 pl-8 pr-8 text-sm'
				: 'py-1.5 pl-7 pr-7 text-[12.5px]'}"
		/>
		{#if value}
			<button
				type="button"
				onclick={() => set('')}
				aria-label="Clear search"
				title="Clear search"
				class="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded p-0.5 text-ink-400 transition-colors hover:text-ink-700"
			>
				<Icon name="x" size={size === 'md' ? 13 : 12} />
			</button>
		{/if}
	</div>
	{#if value && resultLabel}
		<p class="mt-1 pl-1 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400" aria-live="polite">
			{resultLabel}
		</p>
	{/if}
</div>

<style>
	/* The native WebKit clear button would sit under ours. */
	input[type='search']::-webkit-search-cancel-button,
	input[type='search']::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
