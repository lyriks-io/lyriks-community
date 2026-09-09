<script lang="ts">
	import Card from './Card.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	export interface SubTab {
		id: string;
		label: string;
		/** Short secondary line under the label. */
		desc?: string;
		/** Right-aligned count/progress badge (e.g. "3" or "5 · 18"). Hidden when empty. */
		count?: string | number;
		icon: IconName;
	}

	interface Props {
		tabs: SubTab[];
		active: string;
		onSwitch: (id: string) => void;
	}
	let { tabs, active, onSwitch }: Props = $props();

	// Second-level nav (spec: image-2 style). Spans full width to distinguish it
	// from the content-width primary TabBar sitting above it.
</script>

<Card class="w-full flex-wrap gap-1 p-2" padding={false}>
	<div class="flex w-full flex-wrap gap-1" role="tablist">
		{#each tabs as tab (tab.id)}
			{@const isActive = tab.id === active}
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
					{#if tab.desc}
						<span class="block text-[10px] leading-tight {isActive ? 'text-white/75' : 'text-ink-400'}">
							{tab.desc}
						</span>
					{/if}
				</span>
				{#if tab.count !== undefined && tab.count !== '' && `${tab.count}` !== '0'}
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
