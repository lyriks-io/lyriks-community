<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { TONE } from '../verdict-tones';

	/**
	 * Every drawing of a view at once, beside it (ac-evo-func-uml, ac-evo-tech-uml):
	 * the flows, the things whose states change, the sequences, each by its name
	 * and what it holds, the one drawn in violet, one that holds a problem with the
	 * problem's sign; picking one draws it. Its column is sized by the drawing, so
	 * a long list scrolls inside it.
	 */
	export interface DrawingEntry {
		readonly name: string;
		/** What it holds, counted: "4 steps", "3 states", "5 messages". */
		readonly detail: string;
		readonly marked: boolean;
	}
	interface Props {
		entries: readonly DrawingEntry[];
		active: string | null;
		onpick: (name: string) => void;
		/** What the list holds, for a screen reader: "Flows", "Things", "Sequences". */
		label: string;
		/** What the problem's sign says, in words. */
		unclear: string;
	}
	let { entries, active, onpick, label, unclear }: Props = $props();
</script>

<ul class="space-y-0.5 p-1.5" aria-label={label}>
	{#each entries as entry (entry.name)}
		{@const on = active === entry.name}
		<li>
			<button
				type="button"
				class="flex w-full items-start gap-2 rounded-field px-2.5 py-2 text-left {on
					? 'bg-ink text-paper'
					: 'text-ink-700 transition-colors duration-150 hover:bg-toner-1'}"
				aria-current={on ? 'true' : undefined}
				onclick={() => onpick(entry.name)}
			>
				<span class="min-w-0 flex-1">
					<span class="block text-[0.78125rem] font-semibold leading-tight">{entry.name}</span>
					<span class="mt-0.5 block font-evo-mono text-[0.6875rem] {on ? 'text-toner-2' : 'text-ink-500'}">{entry.detail}</span>
				</span>
				{#if entry.marked}
					<span title={unclear} class="mt-0.5 shrink-0">
						<Icon name={TONE.decide.icon} size={13} class={on ? 'text-orange' : TONE.decide.text} />
						<span class="sr-only">{unclear}</span>
					</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>
