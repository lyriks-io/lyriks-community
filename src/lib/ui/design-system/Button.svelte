<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';
	export type ButtonSize = 'sm' | 'md';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: ButtonVariant;
		size?: ButtonSize;
		type?: 'button' | 'submit';
		disabled?: boolean;
		title?: string;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		title,
		href,
		onclick,
		class: klass = '',
		children
	}: Props = $props();

	// The design's button (.ly-btn): square, a 1.5px ink border, a bold uppercase
	// label, and the hard press shadow of `pressable`. Ghost is the one quiet
	// variant: no border, no shadow, it only tints under the pointer.
	const base =
		'inline-flex items-center justify-center gap-2 font-bold uppercase tracking-[0.07em] whitespace-nowrap rounded-none disabled:opacity-40 disabled:pointer-events-none select-none';
	const pressed = 'border-[1.5px] border-ink-900 pressable';

	const sizes: Record<ButtonSize, string> = {
		sm: 'h-8 px-3 text-xs',
		md: 'h-10 px-4 text-xs'
	};

	const variants: Record<ButtonVariant, string> = {
		primary: `${pressed} bg-brand-500 text-white`,
		outline: `${pressed} bg-transparent text-ink-900`,
		ghost: 'text-ink-700 hover:bg-surface-sunken hover:text-ink-900',
		danger: `${pressed} bg-danger-600 text-white`,
		soft: `${pressed} bg-brand-100 text-brand-500`
	};

	const cls = $derived(`${base} ${sizes[size]} ${variants[variant]} ${klass}`);
</script>

{#if href}
	<a {href} {title} class={cls} aria-disabled={disabled} {onclick}>
		{@render children()}
	</a>
{:else}
	<button {type} {disabled} {title} class={cls} {onclick}>
		{@render children()}
	</button>
{/if}
