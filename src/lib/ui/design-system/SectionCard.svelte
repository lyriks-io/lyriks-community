<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		icon: IconName;
		title: string;
		/** Right-aligned mono meta (mockup: completion count e.g. "3/5" or "✓ 5"). */
		meta?: string;
		/** Optional top-right slot (e.g. an AI "suggest" button). */
		action?: Snippet;
		children: Snippet;
	}
	let { icon, title, meta, action, children }: Props = $props();

	// One tint for every card title, and the title alone: a page reads as one
	// document, never as a patchwork of colours and taglines. The design's label:
	// mono, spaced, uppercase, in the muted ink.
	const tint = 'text-ink-500';
</script>

<Card>
	<header class="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
		<div class="flex min-w-0 items-center gap-2">
			<Icon name={icon} size={14} class="shrink-0 {tint}" />
			<span class="shrink-0 font-mono text-[0.625rem] font-bold uppercase tracking-[0.08em] {tint}">
				{title}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-3">
			{#if meta}
				<span class="font-mono text-[0.6875rem] text-ink-400">{meta}</span>
			{/if}
			{#if action}
				{@render action()}
			{/if}
		</div>
	</header>

	{@render children()}
</Card>
