<script lang="ts">
	/**
	 * The second-level navigation of a section: a sticky card of grouped entries
	 * on the left, the active entry's content on the right.
	 *
	 * Foundation's Ops tab established this pattern; it lives here so every
	 * section that splits into sub-views renders the SAME chrome — same widths,
	 * same active state, same count badges — instead of each one inventing its
	 * own tab strip. Purely presentational: the caller owns which entry is
	 * active and what the content column shows.
	 */
	import type { Snippet } from 'svelte';
	import { Card, Icon, type IconName } from '$ui/design-system';

	export interface SectionNavItem {
		id: string;
		label: string;
		/** One line under the label — what this view is for. */
		hint: string;
		icon: IconName;
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
</script>

<div class="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
	<!-- Sticky rail capped to the VISIBLE screen (100vh minus the top bar, the
	     sticky top gap and the bottom SaveBar), scrolling internally past that —
	     so a long entry list never disappears below the fold. -->
	<Card
		class="md:sticky md:top-2 md:max-h-[calc(100vh-8.5rem)] md:overflow-y-auto md:overscroll-contain"
		padding={false}
	>
		<div class="space-y-3 p-2">
			{#each groups as group (group.label)}
				<div class="space-y-0.5">
					<div class="px-3 pb-1 pt-2 text-[9.5px] font-bold uppercase tracking-widest text-ink-400">
						{group.label}
					</div>
					{#each group.items as item (item.id)}
						{@const isActive = active === item.id}
						<button
							type="button"
							onclick={() => onSelect(item.id)}
							aria-current={isActive ? 'page' : undefined}
							class="flex w-full items-center gap-2.5 rounded-field border px-3 py-2 text-left transition {isActive
								? 'border-brand-200 bg-brand-50 text-ink-900'
								: 'border-transparent text-ink-600 hover:bg-surface-sunken'}"
						>
							<Icon name={item.icon} size={16} class={isActive ? 'text-brand-500' : 'text-ink-400'} />
							<div class="min-w-0 flex-1">
								<div class="text-[12.5px] font-semibold leading-tight">{item.label}</div>
								<div class="truncate text-[9.5px] leading-snug text-ink-400">{item.hint}</div>
							</div>
							{#if item.count}
								<span
									class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] {isActive
										? 'bg-brand-100 text-brand-700'
										: 'bg-surface-sunken text-ink-500'}"
								>
									{item.count}
								</span>
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
