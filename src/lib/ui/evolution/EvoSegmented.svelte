<script lang="ts">
	/**
	 * The segmented control of the Evolution design: List or Diagram, the
	 * executive summary or the details, as the design's segmented control (.ly-seg):
 * a sand track, mono bold segments, the chosen one filled with ink.
	 */
	interface Props {
		/** `owed` marks a segment with a small amber dot, its sentence in the tooltip. */
		segments: readonly { readonly id: string; readonly label: string; readonly owed?: string }[];
		active: string;
		onSelect: (id: string) => void;
		label: string;
		/** Read as tabs (the panels they open) rather than as a view toggle. */
		tabs?: boolean;
		id?: string;
	}
	let { segments, active, onSelect, label, tabs = false, id }: Props = $props();
</script>

<div {id} role={tabs ? 'tablist' : 'group'} aria-label={label} class="flex gap-1 self-start rounded-2xl border border-transparent bg-surface p-1.5">
	{#each segments as segment (segment.id)}
		{@const on = segment.id === active}
		<button
			type="button"
			role={tabs ? 'tab' : undefined}
			aria-selected={tabs ? on : undefined}
			aria-pressed={tabs ? undefined : on}
			class="min-h-10 whitespace-nowrap rounded-evo-btn px-4 font-evo-mono text-xs font-bold tracking-[0.06em] {on ? 'bg-ink text-paper' : 'bg-transparent text-ink-2 hover:bg-toner-1'}"
			title={segment.owed}
			onclick={() => onSelect(segment.id)}
			>{segment.label}{#if segment.owed}<span class="ml-1.5 inline-block size-2 bg-orange align-middle" role="img" aria-label={segment.owed}></span>{/if}</button
		>
	{/each}
</div>
