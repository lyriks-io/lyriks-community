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
			? 'border-transparent bg-brand-gradient text-white shadow-card enabled:hover:brightness-105'
			: active
				? 'border-brand-300 bg-brand-50 text-brand-600'
				: 'border-line text-ink-600 enabled:hover:bg-surface-sunken'
	);
</script>

<!-- Compact toolbar button — the xs tier the main Button doesn't cover. -->
<button
	type="button"
	{disabled}
	{title}
	{onclick}
	aria-pressed={active || undefined}
	class="inline-flex shrink-0 items-center gap-1 rounded-field border px-2 py-1 text-xs font-semibold transition-colors select-none disabled:opacity-40 {look} {klass}"
>
	{@render children()}
</button>
