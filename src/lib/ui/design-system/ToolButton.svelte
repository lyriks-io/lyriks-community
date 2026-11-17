<script lang="ts" module>
	export type ToolButtonVariant = 'outline' | 'primary';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Toggled/selected state — renders with a brand tint. */
		active?: boolean;
		variant?: ToolButtonVariant;
		disabled?: boolean;
		title?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children: Snippet;
	}
	let {
		active = false,
		variant = 'outline',
		disabled = false,
		title,
		onclick,
		class: klass = '',
		children
	}: Props = $props();

	const look = $derived(
		variant === 'primary'
			? 'pressable border-ink bg-brand-500 text-paper'
			: active
				? 'border-ink bg-ink text-paper'
				: 'border-ink-3 text-ink enabled:hover:border-ink'
	);
</script>

<!-- Compact toolbar button — the xs tier the main Button doesn't cover. -->
<button
	type="button"
	{disabled}
	{title}
	{onclick}
	aria-pressed={active || undefined}
	class="inline-flex shrink-0 items-center gap-1 border-[1.5px] px-2 py-1 text-xs font-bold transition-colors select-none disabled:opacity-40 {look} {klass}"
>
	{@render children()}
</button>
