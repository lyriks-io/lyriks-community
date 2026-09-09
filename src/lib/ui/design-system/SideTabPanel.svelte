<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import type { SubTab } from './SubTabBar.svelte';

	interface Props {
		tabs: SubTab[];
		active: string;
		onSwitch: (id: string) => void;
		/** The active sub-section's content, rendered in the right-hand column. */
		children: Snippet;
	}
	let { tabs, active, onSwitch, children }: Props = $props();

	// Second-level nav as a left sidebar floating sticky panel (matches the Ops /
	// Foundation layout) instead of a full-width horizontal bar: the nav stays put
	// while the section content scrolls beside it.
</script>

<div class="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
	<Card class="md:sticky md:top-2" padding={false}>
		<div class="space-y-0.5 p-2" role="tablist">
			{#each tabs as tab (tab.id)}
				{@const isActive = tab.id === active}
				<button
					type="button"
					role="tab"
					aria-selected={isActive}
					onclick={() => onSwitch(tab.id)}
					class="flex w-full items-center gap-2.5 rounded-field border px-3 py-2 text-left transition {isActive
						? 'border-brand-200 bg-brand-50 text-ink-900'
						: 'border-transparent text-ink-600 hover:bg-surface-sunken'}"
				>
					<Icon name={tab.icon} size={16} class={isActive ? 'text-brand-500' : 'text-ink-400'} />
					<div class="min-w-0 flex-1">
						<div class="text-[12.5px] font-semibold leading-tight">{tab.label}</div>
						{#if tab.desc}
							<div class="truncate text-[9.5px] leading-snug text-ink-400">{tab.desc}</div>
						{/if}
					</div>
					{#if tab.count !== undefined && tab.count !== '' && `${tab.count}` !== '0'}
						<span
							class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] {isActive
								? 'bg-brand-100 text-brand-700'
								: 'bg-surface-sunken text-ink-500'}"
						>
							{tab.count}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</Card>

	<div class="min-w-0">
		{@render children()}
	</div>
</div>
