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

	// The design's tag: square, a 1.5px border in the tone's colour, its text in
	// the tone's ink; never a shadow (only what can be pressed wears one).
	const tones: Record<ChipTone, string> = {
		brand: 'border-brand-400 text-brand-500',
		accent: 'border-accent-400 text-accent-600',
		neutral: 'border-line bg-surface-sunken text-ink-700',
		success: 'border-success-500 bg-success-100 text-success-700',
		warning: 'border-warning-500 bg-warning-100 text-warning-700',
		danger: 'border-danger-500 bg-danger-100 text-danger-600'
	};
</script>

<span
	class="inline-flex items-center gap-1.5 border-[1.5px] px-2 py-[2.5px] text-xs font-medium {tones[
		tone
	]} {klass}"
>
	{@render children()}
	{#if removable}
		<button
			type="button"
			onclick={onremove}
			class="-mr-1 grid size-4 place-items-center opacity-60 hover:opacity-100"
			aria-label="Remove"
		>
			<Icon name="x" size={12} />
		</button>
	{/if}
</span>
