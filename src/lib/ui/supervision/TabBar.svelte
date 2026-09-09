<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';
	import type { SupervisionTab } from '$domain/supervision';
	import type { SupervisionStore } from './draft-store.svelte';

	interface Props {
		active: SupervisionTab;
		store: SupervisionStore;
		/** Gateway verdict headline (from the embedded governor) for the tab eyebrow. */
		gatewayVerdict: string;
		onSwitch: (tab: SupervisionTab) => void;
	}
	let { active, store, gatewayVerdict, onSwitch }: Props = $props();

	interface Tab {
		id: SupervisionTab;
		label: string;
		eyebrow: string;
		count: string;
		icon: IconName;
	}

	const tabs = $derived<Tab[]>([
		{
			id: 'tasks',
			label: 'Task tracking',
			eyebrow: 'Who does what, and the pace',
			count: String(store.draft.assignments.length),
			icon: 'grid'
		},
		{
			id: 'policy',
			label: 'AI policy',
			eyebrow: 'Usage compliance, enforced live',
			count: `${store.compliance}%`,
			icon: 'shield'
		},
		{
			id: 'gateway',
			label: 'AI Gateway',
			eyebrow: gatewayVerdict,
			count: `${store.gatewayTotals.provisioned}/${store.gatewayTotals.members}`,
			icon: 'server'
		},
		{
			id: 'traceability',
			label: 'Traceability',
			eyebrow: 'Decision log & releases',
			count: String(store.draft.decisions.length),
			icon: 'layers'
		}
	]);
</script>

<div class="flex gap-3" role="tablist">
	{#each tabs as tab (tab.id)}
		{@const isActive = tab.id === active}
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			onclick={() => onSwitch(tab.id)}
			class="flex flex-1 items-center gap-3 rounded-card border px-4 py-3 text-left transition-all {isActive
				? 'border-brand-300 bg-brand-gradient text-white shadow-card'
				: 'border-line bg-surface text-ink-700 hover:border-line-strong'}"
		>
			<span
				class="grid size-9 place-items-center rounded-lg {isActive
					? 'bg-white/15'
					: 'bg-surface-sunken'}"
			>
				<Icon name={tab.icon} size={16} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold leading-tight">{tab.label}</span>
				<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
					{tab.eyebrow}
				</span>
			</span>
			<span
				class="rounded-pill px-2 py-0.5 text-[10px] font-semibold {isActive
					? 'bg-white/15'
					: 'bg-surface-sunken text-ink-500'}"
			>
				{tab.count}
			</span>
		</button>
	{/each}
</div>
