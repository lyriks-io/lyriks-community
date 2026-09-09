<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	type HeaderColor = 'violet' | 'pink' | 'amber' | 'mint' | 'blue';

	interface Props {
		icon: IconName;
		title: string;
		/** Short inline hint after the title (mockup: SectionHeader `hint`). */
		eyebrow?: string;
		/** Fallback hint when no eyebrow is given. */
		subtitle?: string;
		/** Accent colour of the title + icon, matching the mockup's per-section tint. */
		color?: HeaderColor;
		/** Right-aligned mono meta (mockup: completion count e.g. "3/5" or "✓ 5"). */
		meta?: string;
		/** Optional top-right slot (e.g. an AI "suggest" button). */
		action?: Snippet;
		children: Snippet;
	}
	let { icon, title, eyebrow, subtitle, color = 'violet', meta, action, children }: Props = $props();

	const tint: Record<HeaderColor, string> = {
		violet: 'text-brand-400',
		pink: 'text-magenta-400',
		amber: 'text-warning-500',
		mint: 'text-success-500',
		blue: 'text-accent-500'
	};
	const hint = $derived(eyebrow ?? subtitle);
</script>

<Card>
	<header class="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
		<div class="flex min-w-0 items-center gap-2">
			<Icon name={icon} size={14} class="shrink-0 {tint[color]}" />
			<span class="shrink-0 text-[10px] font-bold uppercase tracking-widest {tint[color]}">
				{title}
			</span>
			{#if hint}
				<span class="truncate text-[11px] text-ink-400">{hint}</span>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-3">
			{#if meta}
				<span class="font-mono text-[11px] text-ink-400">{meta}</span>
			{/if}
			{#if action}
				{@render action()}
			{/if}
		</div>
	</header>

	{@render children()}
</Card>
