<script lang="ts" module>
	export type TraceabilityTab = 'overview' | 'baselines' | 'approvals';
</script>

<script lang="ts">
	import { Icon, type IconName } from '$ui/design-system';

	interface Props {
		active: TraceabilityTab;
		/** Per-tab count shown as the trailing pill. */
		counts: Record<TraceabilityTab, string>;
		onSwitch: (tab: TraceabilityTab) => void;
	}
	let { active, counts, onSwitch }: Props = $props();

	interface Tab {
		id: TraceabilityTab;
		label: string;
		eyebrow: string;
		icon: IconName;
	}

	const tabs: Tab[] = [
		{
			id: 'overview',
			label: 'Coverage',
			eyebrow: 'Requirements & gaps',
			icon: 'list'
		},
		{
			id: 'baselines',
			label: 'Baselines',
			eyebrow: 'Named versions & snapshots',
			icon: 'flag'
		},
		{
			id: 'approvals',
			label: 'Approvals',
			eyebrow: 'Sign-off & accepted risks',
			icon: 'file-check'
		}
	];
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
				{counts[tab.id]}
			</span>
		</button>
	{/each}
</div>
