<script lang="ts">
	import { FIELD } from '../page/look';
	/**
	 * The v2 design's find field: a full-width box over the list or the map it
	 * narrows, its magnifier at the left, a clear cross once something is typed,
	 * Escape to clear, and how many are kept said under it while it narrows.
	 */
	interface Props {
		value?: string;
		placeholder: string;
		/** "4 of 6 tables": shown while a query is typed. */
		resultLabel?: string | null;
		class?: string;
	}
	let { value = $bindable(''), placeholder, resultLabel = null, class: klass = '' }: Props = $props();
</script>

<div class="min-w-0 {klass}">
	<div class="relative">
		<svg class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
		<input
			type="search"
			bind:value
			{placeholder}
			aria-label={placeholder.replace(/…$/, '')}
			onkeydown={(e) => {
				if (e.key === 'Escape' && value) {
					e.stopPropagation();
					value = '';
				}
			}}
			class="box-border min-h-[42px] w-full {FIELD} pr-10 pl-9 text-sm transition-colors hover:border-ink"
		/>
		{#if value}
			<button
				type="button"
				onclick={() => (value = '')}
				aria-label="Clear the search"
				class="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-evo-muted hover:text-evo-ink"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
			</button>
		{/if}
	</div>
	{#if value && resultLabel}<p class="m-0 mt-1.5 pl-1 text-xs text-evo-muted" aria-live="polite">{resultLabel}</p>{/if}
</div>

<style>
	/* The native WebKit clear button would sit under ours. */
	input[type='search']::-webkit-search-cancel-button,
	input[type='search']::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}
</style>
