<script lang="ts" module>
	export interface PillTab {
		id: string;
		label: string;
		/** What the tab holds, shown as its tooltip on hover. */
		desc?: string;
	}
</script>

<script lang="ts">
	import SlideHighlight from './SlideHighlight.svelte';

	/**
	 * The one tab bar every page uses: a white strip of tabs, each its name alone,
	 * and ONE highlight under the selected tab that slides to the next one.
	 *
	 * The names are drawn twice, laid out identically: in grey on the strip, and
	 * in white in an overlay clipped to the highlight. A name is therefore white
	 * exactly where the highlight covers it, during the slide too, instead of
	 * fading on its own clock (white on white for a moment, then late).
	 *
	 * Before the highlight is placed (server render) the selected tab paints its
	 * own background and white name, so the bar never shows nothing selected.
	 */
	interface Props {
		tabs: readonly PillTab[];
		active: string;
		onSelect: (id: string) => void;
		/** Accessible name of the tab list. */
		label?: string;
		/** Extra classes on the strip (spacing, alignment). */
		class?: string;
	}
	let { tabs, active, onSelect, label, class: klass = '' }: Props = $props();

	let strip = $state<HTMLDivElement>();
	let placed = $state(false);

	// Shared by the tab and its white copy so the two lay out to the pixel.
	// The design's segmented control (.ly-seg): mono bold labels on a sand track, the selected one ink.
	const LAYOUT = 'px-3.5 py-2 font-evo-mono text-xs font-bold tracking-[0.06em] leading-tight';
</script>

<div
	bind:this={strip}
	class="relative inline-flex max-w-full flex-wrap gap-1 border border-transparent bg-surface p-1.5 {klass}"
	role="tablist"
	aria-label={label}
>
	<SlideHighlight
		container={strip}
		target={`[data-tab-id="${active}"]`}
		watch={tabs.map((t) => t.label).join()}
		class="bg-ink"
		radius={0}
		onPlaced={(p) => (placed = p)}
	>
		{#snippet overlay()}
			<div class="flex flex-wrap gap-1 p-1.5">
				{#each tabs as tab (tab.id)}
					<span class="{LAYOUT} text-paper">{tab.label}</span>
				{/each}
			</div>
		{/snippet}
	</SlideHighlight>
	{#each tabs as tab (tab.id)}
		{@const isActive = tab.id === active}
		<button
			type="button"
			role="tab"
			data-tab-id={tab.id}
			aria-selected={isActive}
			onclick={() => onSelect(tab.id)}
			title={tab.desc}
			class="relative {LAYOUT} text-left {isActive
				? placed
					? 'text-ink-2'
					: 'bg-ink text-paper'
				: 'text-ink-2 transition-colors duration-150 hover:bg-surface-sunken hover:text-ink'}"
		>
			{tab.label}
		</button>
	{/each}
</div>
