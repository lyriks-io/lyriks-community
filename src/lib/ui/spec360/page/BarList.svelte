<script lang="ts">
	import type { Snippet } from 'svelte';
	import { LIST } from './look';

	/** The white card a column of bar rows sits in; `more` is its last line (a "Show the 28 other points"). */
	let { children, more, label }: { children: Snippet; more?: Snippet; label?: string } = $props();
</script>

<div class={LIST} role={label ? 'list' : undefined} aria-label={label}>
	{@render children()}
	{#if more}{@render more()}{/if}
</div>
