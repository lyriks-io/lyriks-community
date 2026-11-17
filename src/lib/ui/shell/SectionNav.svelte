<script lang="ts">
	/**
	 * The second-level navigation of a section: a sticky card of grouped entries
	 * on the left, the active entry's content on the right.
	 *
	 * Foundation's Ops tab established this pattern; it lives here so every
	 * section that splits into sub-views renders the SAME chrome — same widths
	 * and the same active state — instead of each one inventing its
	 * own tab strip. Purely presentational: the caller owns which entry is
	 * active and what the content column shows.
	 */
	import type { Snippet } from 'svelte';
	import { Card, Icon, SlideHighlight, type IconName } from '$ui/design-system';

	export interface SectionNavItem {
		id: string;
		label: string;
		/** What this view is for, shown as the item's tooltip on hover. */
		hint: string;
		/** An icon before the name, for a rail whose entries carry a state (the steps of a request). */
		icon?: IconName;
		/** The icon's colour when it carries a state (a step validated, blocked...); the default follows the active entry. */
		iconClass?: string;
		/** Progress at a glance; hidden when 0. */
		count?: number;
	}
	export interface SectionNavGroup {
		label: string;
		items: SectionNavItem[];
	}

	interface Props {
		groups: SectionNavGroup[];
		active: string;
		onSelect: (id: string) => void;
		/** The active entry's content. */
		children: Snippet;
		/** Optional action pinned under the entries (e.g. a refresh button). */
		footer?: Snippet;
	}
	let { groups, active, onSelect, children, footer }: Props = $props();

	// One highlight slides from the old entry to the new one, in the tab bars'
	// violet gradient. The names are drawn twice, in ink on the rail and in white
	// in an overlay clipped to the highlight, so a name turns white exactly where
	// the highlight covers it. Until it is placed (server render) the selected
	// entry paints its own gradient.
	let list = $state<HTMLDivElement>();
	let placed = $state(false);

	// Shared by the rail and its white copy so the two lay out to the pixel.
	const GROUP = 'px-3 pb-1 pt-2 font-evo-mono text-[0.625rem] font-bold tracking-[0.08em] uppercase text-ink-3';
	const ENTRY = 'flex w-full items-center gap-2.5 rounded-field border px-3 py-2';
	const NAME = 'text-[0.78125rem] font-semibold leading-tight';
	// The selected entry wears ink, its name in paper (the design's selection, .ly-chip.is-on).
	const GRADIENT = 'bg-ink';
</script>

<div class="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
	<!-- Sticky rail capped to the VISIBLE screen (100vh minus the top bar, the
	     page's sticky header, the top gap and the bottom SaveBar), scrolling internally past that —
	     so a long entry list never disappears below the fold. -->
	<Card
		class="md:sticky md:top-[calc(var(--page-header-h,0px)_+_0.5rem)] md:max-h-[calc(100vh_-_8.5rem_-_var(--page-header-h,0px))] md:overflow-y-auto md:overscroll-contain"
		padding={false}
	>
		<div bind:this={list} class="relative space-y-3 p-2">
			<SlideHighlight
				container={list}
				target={`[data-nav-id="${active}"]`}
				watch={groups.map((g) => g.items.map((i) => i.id).join()).join()}
				class={GRADIENT}
				radius={0}
				onPlaced={(p) => (placed = p)}
			>
				{#snippet overlay()}
					<div class="space-y-3 p-2">
						{#each groups as group (group.label)}
							<div class="space-y-0.5">
								<div class="invisible {GROUP}">{group.label}</div>
								{#each group.items as item (item.id)}
									<div class="{ENTRY} border-transparent text-paper">
										{#if item.icon}<Icon name={item.icon} size={16} class="text-paper" />{/if}
										<div class="min-w-0 flex-1">
											<div class="{NAME}">{item.label}</div>
										</div>
										{#if item.count}<span class="shrink-0 px-1.5 py-0.5 font-mono text-[0.59375rem]">{item.count}</span>{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/snippet}
			</SlideHighlight>
			{#each groups as group (group.label)}
				<div class="space-y-0.5">
					<div class="{GROUP}">{group.label}</div>
					{#each group.items as item (item.id)}
						{@const isActive = active === item.id}
						<button
							type="button"
							onclick={() => onSelect(item.id)}
							title={item.hint}
							data-nav-id={item.id}
							aria-current={isActive ? 'page' : undefined}
							class="relative {ENTRY} text-left {isActive
								? placed
									? 'border-transparent text-ink-2'
									: `border-transparent text-paper ${GRADIENT}`
								: 'border-transparent text-ink-2 transition-colors duration-150 hover:bg-surface-sunken hover:text-ink'}"
						>
							{#if item.icon}
								<Icon name={item.icon} size={16} class={item.iconClass ?? (isActive ? 'text-blue-ink' : 'text-ink-3')} />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="{NAME}">{item.label}</div>
							</div>
							{#if item.count}
								<span class="shrink-0 px-1.5 py-0.5 font-mono text-[0.59375rem] font-bold text-ink-3">{item.count}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
			{#if footer}
				<div class="border-t border-line px-1 pb-1 pt-2">{@render footer()}</div>
			{/if}
		</div>
	</Card>

	<div class="min-w-0">{@render children()}</div>
</div>
