<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';
	import SlideHighlight from './SlideHighlight.svelte';
	import type { PillTab } from './PillTabs.svelte';

	interface Props {
		tabs: PillTab[];
		active: string;
		onSwitch: (id: string) => void;
		/** The active sub-section's content, rendered in the right-hand column. */
		children: Snippet;
	}
	let { tabs, active, onSwitch, children }: Props = $props();

	// One highlight slides from the old entry to the new one, in the tab bars'
	// violet gradient; the names are drawn again in white in an overlay clipped
	// to it, so a name turns white exactly where the highlight covers it. Until
	// it is placed (server render) the selected entry paints its own gradient.
	let list = $state<HTMLDivElement>();
	let placed = $state(false);

	// Shared by the entries and their white copy so the two lay out to the pixel.
	const ENTRY = 'flex w-full items-center gap-2.5 rounded-field border px-3 py-2';
	const NAME = 'text-[0.78125rem] font-semibold leading-tight';
	// The selected entry wears ink, its name in paper (the design's selection, .ly-chip.is-on).
	const GRADIENT = 'bg-ink';

	// Second-level nav as a left sidebar floating sticky panel (matches the Ops /
	// Foundation layout) instead of a full-width horizontal bar: the nav stays put
	// while the section content scrolls beside it.
</script>

<div class="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
	<Card class="md:sticky md:top-[calc(var(--page-header-h,0px)_+_0.5rem)]" padding={false}>
		<div bind:this={list} class="relative space-y-0.5 p-2" role="tablist">
			<SlideHighlight
				container={list}
				target={`[data-tab-id="${active}"]`}
				watch={tabs.map((t) => t.id).join()}
				class={GRADIENT}
				radius={0}
				onPlaced={(p) => (placed = p)}
			>
				{#snippet overlay()}
					<div class="space-y-0.5 p-2">
						{#each tabs as tab (tab.id)}
							<div class="{ENTRY} border-transparent text-paper">
								<div class="min-w-0 flex-1">
									<div class="{NAME}">{tab.label}</div>
								</div>
							</div>
						{/each}
					</div>
				{/snippet}
			</SlideHighlight>
			{#each tabs as tab (tab.id)}
				{@const isActive = tab.id === active}
				<button
					type="button"
					role="tab"
					aria-selected={isActive}
					onclick={() => onSwitch(tab.id)}
					title={tab.desc}
					data-tab-id={tab.id}
					class="relative {ENTRY} text-left {isActive
						? placed
							? 'border-transparent text-ink-2'
							: `border-transparent text-paper ${GRADIENT}`
						: 'border-transparent text-ink-2 transition-colors duration-150 hover:bg-surface-sunken hover:text-ink'}"
				>
					<div class="min-w-0 flex-1">
						<div class="{NAME}">{tab.label}</div>
					</div>
				</button>
			{/each}
		</div>
	</Card>

	<div class="min-w-0">
		{@render children()}
	</div>
</div>
