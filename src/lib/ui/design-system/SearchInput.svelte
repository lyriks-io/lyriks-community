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

	/* The bar is as wide as its words: the placeholder, or what is typed once it
	   is longer, measured in the input's own type, plus the room the magnifier
	   and the clear button take. It never exceeds its container, and the width
	   it is given wins over any fixed cap a page set, so no placeholder is cut
	   where the row has the room to show it. */
	let textWidth = $state(0);
	const shownText = $derived(value.length > placeholder.length ? value : placeholder);
	const sidePadding = $derived(size === 'md' ? 70 : 62);
	const fitStyle = $derived(
		textWidth > 0 ? `width:${Math.ceil(textWidth) + sidePadding}px;max-width:100%` : ''
	);
</script>

<div class="min-w-0 {klass}" style={fitStyle}>
	<div class="relative">
		<span
			bind:offsetWidth={textWidth}
			aria-hidden="true"
			class="pointer-events-none invisible absolute left-0 top-0 whitespace-pre {size === 'md'
				? 'text-sm'
				: 'text-[0.78125rem]'}">{shownText}</span
		>
		<span
			class="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-ink-3"
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
			class="w-full border-[1.5px] border-ink-3 bg-surface-sunken text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-ink focus:border-blue disabled:cursor-not-allowed disabled:opacity-60 {size ===
			'md'
				? 'py-2 pl-8 pr-8 text-sm'
				: 'py-1.5 pl-7 pr-7 text-[0.78125rem]'}"
		/>
		{#if value}
			<button
				type="button"
				onclick={() => set('')}
				aria-label="Clear search"
				title="Clear search"
				class="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center p-0.5 text-ink-3 transition-colors hover:text-ink"
			>
				<Icon name="x" size={size === 'md' ? 13 : 12} />
			</button>
		{/if}
	</div>
	{#if value && resultLabel}
		<p class="mt-1 pl-1 font-evo-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase" aria-live="polite">
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
