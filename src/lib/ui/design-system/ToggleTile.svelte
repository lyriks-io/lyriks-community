<script lang="ts">
	import Icon from './Icon.svelte';

	// One boolean standing on its own, or one option of a pick-all-that-apply.
	// Either way it is ticked, never pointed at: a round dot is the mark of one
	// choice among several and reads as a decision already taken, so nobody sees
	// that it is theirs to withdraw.

	interface Props {
		title: string;
		hint?: string;
		selected: boolean;
		onToggle: () => void;
	}
	let { title, hint, selected, onToggle }: Props = $props();
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={selected}
	onclick={onToggle}
	class="flex w-full items-start gap-3 rounded-field border px-3.5 py-3 text-left transition-colors {selected
		? 'border-accent-400 bg-accent-50'
		: 'border-line bg-surface hover:border-line-strong'}"
>
	<span
		class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border {selected
			? 'border-accent-500 bg-accent-500 text-white'
			: 'border-line-strong'}"
	>
		{#if selected}
			<Icon name="check" size={12} />
		{/if}
	</span>
	<span class="min-w-0">
		<span class="block text-sm font-medium {selected ? 'text-accent-600' : 'text-ink-900'}">
			{title}
		</span>
		{#if hint}
			<span class="block text-xs text-ink-500">{hint}</span>
		{/if}
	</span>
</button>
