<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import type { FeaturesTab } from '$domain/features';
	import type { FeaturesStore } from './draft-store.svelte';

	interface Props {
		active: FeaturesTab;
		store: FeaturesStore;
		onSwitch: (tab: FeaturesTab) => void;
		/** Behavior overview + Rules folded in as tabs — counts sourced by the page. */
		behaviorCount?: number;
		rulesCount?: number;
	}
	let { active, store, onSwitch, behaviorCount, rulesCount }: Props = $props();

	interface Tab {
		id: FeaturesTab;
		label: string;
		eyebrow: string;
		count: string;
		icon: IconName;
	}

	const tabs = $derived<Tab[]>([
		{
			id: 'tree',
			label: 'Features',
			eyebrow: 'Cores · Families · Features',
			count: `${store.draft.cores.length} · ${store.draft.features.length}`,
			icon: 'grid'
		},
		{
			id: 'roadmap',
			label: 'Roadmap',
			eyebrow: 'Phase by phase delivery',
			count: String(store.draft.releases.length),
			icon: 'gauge'
		},
		{
			id: 'behavior',
			label: 'Behavior',
			eyebrow: 'Surfaces · actions · scenarios',
			count: behaviorCount === undefined ? '' : String(behaviorCount),
			icon: 'cpu'
		},
		{
			id: 'rules',
			label: 'Rules & edge cases',
			eyebrow: 'Declared rules · acceptance tests',
			count: rulesCount === undefined ? '' : String(rulesCount),
			icon: 'sliders'
		},
		{
			id: 'mywork',
			label: 'My work',
			eyebrow: 'Who owns what',
			count: String(store.draft.assignments?.length ?? 0),
			icon: 'user'
		}
		// 'delivery' is hidden for now — the tab + DeliveryDashboard stay in place
		// (still reachable via ?tab=delivery), just no longer surfaced here.
		// 'reuse' intentionally omitted — the Reuse library tab is hidden for now
		// (ReuseBoard and its API stay in place, just no longer surfaced here).
	]);
</script>

<!-- White pill bar; the active tab carries the violet gradient (matches Users). -->
<div
	class="inline-flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1.5"
	role="tablist"
>
	{#each tabs as tab (tab.id)}
		{@const isActive = tab.id === active}
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			onclick={() => onSwitch(tab.id)}
			class="flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-left transition {isActive
				? 'gradient-violet text-white shadow-md shadow-brand-500/20'
				: 'text-ink-500 hover:bg-surface-sunken'}"
		>
			<Icon name={tab.icon} size={16} />
			<span class="text-left">
				<span class="block text-sm font-semibold leading-tight">{tab.label}</span>
				<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
					{tab.eyebrow}
				</span>
			</span>
			{#if tab.count}
				<span
					class="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] {isActive
						? 'bg-white/15 text-white'
						: 'bg-surface-sunken text-ink-500'}"
				>
					{tab.count}
				</span>
			{/if}
		</button>
	{/each}
</div>
