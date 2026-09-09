<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import type { RequirementsTab } from '$domain/foundation';
	import type { DefinitionStore } from '../definition-store.svelte';
	import BusinessTab from './BusinessTab.svelte';
	import TechnicalTab from './TechnicalTab.svelte';
	import SecurityTab from './SecurityTab.svelte';

	interface Props {
		store: DefinitionStore;
	}
	let { store }: Props = $props();

	interface Tab {
		id: RequirementsTab;
		label: string;
		icon: IconName;
		tone: 'brand' | 'info' | 'success';
	}
	const TABS: Tab[] = [
		{ id: 'business', label: 'Business', icon: 'target', tone: 'brand' },
		{ id: 'technical', label: 'Technical', icon: 'server', tone: 'info' },
		{ id: 'security', label: 'Security', icon: 'shield', tone: 'success' }
	];
</script>

<div class="space-y-5">
	<div class="inline-flex gap-1 rounded-field border border-line bg-surface-sunken p-1" role="tablist">
		{#each TABS as tab (tab.id)}
			{@const isActive = tab.id === store.requirementsTab}
			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				onclick={() => store.switchRequirementsTab(tab.id)}
				class="flex items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition-colors {isActive
					? tab.tone === 'brand'
						? 'bg-brand-50 text-brand-600 shadow-sm'
						: tab.tone === 'info'
							? 'bg-info-50 text-info-600 shadow-sm'
							: 'bg-success-50 text-success-600 shadow-sm'
					: 'text-ink-500 hover:bg-surface'}"
			>
				<Icon name={tab.icon} size={15} />
				{tab.label}
			</button>
		{/each}
	</div>

	{#if store.requirementsTab === 'business'}
		<BusinessTab {store} />
	{:else if store.requirementsTab === 'technical'}
		<TechnicalTab {store} />
	{:else}
		<SecurityTab {store} />
	{/if}
</div>
