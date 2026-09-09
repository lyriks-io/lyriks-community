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

	const base =
		'inline-flex items-center justify-center gap-2 font-medium rounded-pill transition-colors disabled:opacity-50 disabled:pointer-events-none select-none';

	const sizes: Record<ButtonSize, string> = {
		sm: 'h-8 px-3 text-xs',
		md: 'h-10 px-4 text-sm'
	};

	const variants: Record<ButtonVariant, string> = {
		primary: 'bg-brand-gradient text-white shadow-brand hover:brightness-105',
		outline: 'border border-line-strong text-ink-700 bg-surface hover:bg-surface-sunken',
		ghost: 'text-ink-500 hover:text-ink-900 hover:bg-surface-sunken',
		danger: 'border border-danger-500/30 text-danger-500 bg-danger-50 hover:bg-danger-500 hover:text-white',
		soft: 'bg-brand-50 text-brand-600 hover:bg-brand-100'
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
