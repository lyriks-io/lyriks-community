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
	class="flex w-full items-start gap-3 border px-3.5 py-3 text-left transition-colors {selected
		? 'border-ink bg-paper'
		: 'border-line bg-surface-sunken hover:border-ink'}"
>
	<span
		class="mt-0.5 grid size-4 shrink-0 place-items-center border-[1.5px] border-ink {selected
			? 'bg-ink text-paper'
			: 'bg-transparent'}"
	>
		{#if selected}
			<Icon name="check" size={12} />
		{/if}
	</span>
	<span class="min-w-0">
		<span class="block text-sm {selected ? 'font-bold text-ink' : 'font-medium text-ink'}">
			{title}
		</span>
		{#if hint}
			<span class="block text-xs text-ink-2">{hint}</span>
		{/if}
	</span>
</button>
