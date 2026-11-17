<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import type { AddEntry } from './AddMenu.svelte';

	/**
	 * A view with nothing drawn yet (ac-evo-func-uml-edit): what it is waiting for,
	 * and, for whoever may edit, what the view adds as buttons in its middle, so
	 * the drawing starts where the eye already is.
	 */
	interface Props {
		text: string;
		/** What the view adds; none for a reader. */
		entries?: readonly AddEntry[];
	}
	let { text, entries = [] }: Props = $props();
</script>

<div class="grid h-full min-h-40 flex-1 place-items-center px-6 py-6 text-center">
	<div class="space-y-3">
		<p class="text-[0.8125rem] text-ink-500 italic">{text}</p>
		{#if entries.length > 0}
			<div class="flex flex-wrap justify-center gap-2">
				{#each entries as entry (entry.label)}
					<Button size="sm" variant="outline" disabled={!!entry.unavailable} title={entry.unavailable} onclick={entry.onSelect}>
						<Icon name={entry.icon} size={12} />{entry.label}
					</Button>
				{/each}
			</div>
		{/if}
	</div>
</div>
