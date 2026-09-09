<script lang="ts" module>
	export type ChipTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		tone?: ChipTone;
		removable?: boolean;
		onremove?: () => void;
		class?: string;
		children: Snippet;
	}
	let { tone = 'neutral', removable = false, onremove, class: klass = '', children }: Props =
		$props();

	const tones: Record<ChipTone, string> = {
		brand: 'bg-brand-50 text-brand-600',
		accent: 'bg-accent-50 text-accent-500',
		neutral: 'bg-surface-sunken text-ink-700',
		success: 'bg-success-50 text-success-500',
		warning: 'bg-warning-50 text-warning-500',
		danger: 'bg-danger-50 text-danger-500'
	};
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium {tones[
		tone
	]} {klass}"
>
	{@render children()}
	{#if removable}
		<button
			type="button"
			onclick={onremove}
			class="-mr-1 grid size-4 place-items-center rounded-full opacity-60 hover:opacity-100"
			aria-label="Remove"
		>
			<Icon name="x" size={12} />
		</button>
	{/if}
</span>
