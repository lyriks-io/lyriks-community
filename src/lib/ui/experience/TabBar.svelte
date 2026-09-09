<script lang="ts">
	import { Card, Icon, type IconName } from '$ui/design-system';
	import type { ExperienceTab } from '$domain/experience';
	import type { ExperienceStore } from './draft-store.svelte';

	interface Props {
		/** Active experience tab (only meaningful when brand mode is off). */
		active: ExperienceTab;
		/** Whether the Brand & Design tab is the active one. */
		brandActive: boolean;
		store: ExperienceStore;
		onSwitch: (tab: ExperienceTab | 'brand') => void;
	}
	let { active, brandActive, store, onSwitch }: Props = $props();

	interface Tab {
		id: ExperienceTab | 'brand';
		label: string;
		desc: string;
		count: string;
		icon: IconName;
	}

	// One bar for the whole Experience page: Brand & Design lives here alongside the
	// Step5 views, no separate mode switcher. Ordered as a build-up — inputs first
	// (brand, journeys, components, demo data), the simulator last as the output
	// where they all assemble. Landscape is hidden for now — the big-picture view
	// isn't working well yet.
	const tabs = $derived<Tab[]>([
		{
			id: 'brand',
			label: 'Brand & Design',
			desc: 'Identity, tokens & components',
			count: '',
			icon: 'sparkles'
		},
		{
			id: 'journeys',
			label: 'Journeys',
			desc: 'Step-by-step parcours',
			count: `${store.draft.journeys.length} · ${store.draft.steps.length}`,
			icon: 'arrow-right'
		},
		{
			id: 'components',
			label: 'Components',
			desc: 'Reusable blocks & layouts',
			count: String(store.draft.components.length),
			icon: 'layers'
		},
		{
			id: 'data',
			label: 'Demo data',
			desc: 'Seeded collections for the simulator',
			count: String(store.draft.builder.collections.length),
			icon: 'database'
		},
		{
			id: 'screens',
			label: 'Screens & simulator',
			desc: 'Design the UI & run it live',
			count: String(store.draft.screens.length),
			icon: 'monitor'
		}
	]);
</script>

<Card class="inline-flex w-full flex-wrap gap-1 p-2" padding={false}>
	<div class="flex w-full flex-wrap gap-1" role="tablist">
		{#each tabs as tab (tab.id)}
			{@const isActive = tab.id === 'brand' ? brandActive : !brandActive && tab.id === active}
			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				onclick={() => onSwitch(tab.id)}
				class="flex items-center gap-2.5 rounded-lg px-3.5 py-2 transition-all {isActive
					? 'bg-brand-gradient text-white shadow-card'
					: 'text-ink-600 hover:bg-surface-sunken'}"
			>
				<span
					class="grid size-7 place-items-center rounded-md {isActive
						? 'bg-white/15'
						: 'bg-surface-sunken text-ink-500'}"
				>
					<Icon name={tab.icon} size={15} />
				</span>
				<span class="text-left">
					<span class="block text-sm font-semibold leading-tight">{tab.label}</span>
					<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
						{tab.desc}
					</span>
				</span>
				{#if tab.count}
					<span
						class="ml-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold {isActive
							? 'bg-white/15'
							: 'bg-surface-sunken text-ink-500'}"
					>
						{tab.count}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</Card>
